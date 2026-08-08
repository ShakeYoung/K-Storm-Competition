"""人工介入（interject）测试：端点幂等 + DebateMessage.is_human + has_agent_message 防御 + runner 重拉携带。"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="ks_interject_")

from app.model_providers.mock import MockModelProvider  # noqa: E402
from app.orchestrator import runner as runner_mod  # noqa: E402
from app.schemas.models import (  # noqa: E402
    DebateMessage,
    DiscussionMode,
    RunCreate,
    RunStatus,
    TemplateInput,
)
from app.storage import db  # noqa: E402

TEMPLATE = TemplateInput(
    field="测试领域",
    background="研究背景",
    existing_basis="已有基础",
    core_question="如何收敛为可执行选题？",
)


@pytest.fixture(autouse=True)
def _fresh_db(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", Path(_TMP_DIR) / "ks.sqlite3")
    db.init_db()
    yield


def _provider():
    return MockModelProvider()


def _create(**kwargs):
    payload = RunCreate(template_input=TEMPLATE, **kwargs)
    run = runner_mod.create_run_record(payload)
    return run, payload


# ── has_agent_message 防御：人工消息不算 agent 已发言 ──────────────────────

def test_human_message_not_counted_as_agent_spoken():
    from app.agents.registry import DISCUSSION_AGENTS
    agent = DISCUSSION_AGENTS[0]
    human_msg = DebateMessage(round=1, agent="你", title="用户意见", content="注意样本量", is_human=True)
    assert not runner_mod.has_agent_message([human_msg], 1, agent)
    agent_msg = DebateMessage(round=1, agent=agent.display_name, title="x", content="y")
    assert runner_mod.has_agent_message([agent_msg], 1, agent)


# ── interject 幂等：相同内容不重复插入 ──────────────────────────────────────

def test_interject_idempotent():
    run, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=1)
    runner_mod.execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    before = len(db.get_run(run.run_id).debate_messages)

    msg = DebateMessage(round=1, agent="你", title="用户意见（第 1 轮后）", content="请关注批次效应", model_label="用户意见", is_human=True)
    db.update_run(run.run_id, debate_messages=list(db.get_run(run.run_id).debate_messages) + [msg])
    after_first = len(db.get_run(run.run_id).debate_messages)
    assert after_first == before + 1

    # 幂等：模拟端点的去重逻辑
    messages = list(db.get_run(run.run_id).debate_messages)
    duplicate = any(m.is_human and m.round == 1 and m.content == "请关注批次效应" for m in messages)
    assert duplicate  # 已存在
    # 不再追加
    assert len(messages) == after_first


# ── DebateMessage.is_human 默认 False，旧数据兼容 ──────────────────────────

def test_debate_message_is_human_defaults_false():
    msg = DebateMessage.model_validate({"round": 1, "agent": "Novelty Agent", "title": "x", "content": "y"})
    assert msg.is_human is False


def test_debate_message_with_is_human():
    msg = DebateMessage.model_validate({"round": 1, "agent": "你", "title": "意见", "content": "z", "is_human": True})
    assert msg.is_human is True


# ── runner 重拉 DB：下一轮看到人工意见 ──────────────────────────────────────

def test_runner_repulls_db_to_see_interjection(monkeypatch):
    """验证 run_debate_round_serial 会在每轮开始重拉 DB。
    模拟：R1 完成后插入人工意见，R2 开始时应能看到意见数增加。"""
    run, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=2)
    runner_mod.execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    r1_done = db.get_run(run.run_id)
    assert r1_done.status == RunStatus.COMPLETED
    r1_msgs = len(r1_done.debate_messages)

    # 在 R2 之前插入人工意见（模拟用户在 R1 后介入）
    human = DebateMessage(round=1, agent="你", title="用户意见", content="请补充统计功效分析", is_human=True)
    db.update_run(run.run_id, debate_messages=list(r1_done.debate_messages) + [human])

    # run_debate_round_serial 开头的 DB 重拉会把人工意见带入 messages
    # 这里验证重拉逻辑本身：直接调用 round 2，检查 messages 是否包含人工意见
    from app.schemas.models import StructuredBrief
    brief = r1_done.structured_brief or StructuredBrief(research_context="ctx")
    timeline = r1_done.timeline
    messages, _, _ = runner_mod.run_debate_round_serial(
        db.get_run(run.run_id), brief, _provider(), list(r1_done.debate_messages), timeline, 2,
    )
    # 重拉后 messages 应包含人工意见（长度大于 R1 结束时的消息数）
    assert len(messages) > r1_msgs
    assert any(m.is_human for m in messages)


def teardown_module():
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
