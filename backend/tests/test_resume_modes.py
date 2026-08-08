"""resume 按模式路由回归测试。

覆盖：聚焦讨论 / 快速探测 / 记忆查询 从失败位置恢复时走各自的精简路径，
不会退化成完整讨论流程（含 Moderator / Critique / Citation Review）。
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="ks_resume_")

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
    background="研究背景：多智能体科研选题",
    existing_basis="已有基础：原型系统与若干数据",
    core_question="如何收敛为可执行选题？",
)

_ORIG_GENERATE = runner_mod.generate_validated


@pytest.fixture(autouse=True)
def _fresh_db(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", Path(_TMP_DIR) / "ks.sqlite3")
    db.init_db()
    yield


def _provider() -> MockModelProvider:
    return MockModelProvider()


def _create(**kwargs):
    payload = RunCreate(template_input=TEMPLATE, **kwargs)
    run = runner_mod.create_run_record(payload)
    return run, payload


def _install_flaky(monkeypatch, fail_on: set[int]):
    """让第 N 次 generate_validated 调用抛出异常，模拟中途失败。"""
    calls = {"n": 0}

    def _wrapped(provider, **kwargs):
        calls["n"] += 1
        if calls["n"] in fail_on:
            raise RuntimeError("注入的失败")
        return _ORIG_GENERATE(provider, **kwargs)

    monkeypatch.setattr(runner_mod, "generate_validated", _wrapped)
    return calls


def _spy_prompt(monkeypatch, name: str):
    """记录某个 prompt 构造函数是否被调用。"""
    calls = {"n": 0}
    original = getattr(runner_mod, name)

    def _wrapped(*args, **kwargs):
        calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(runner_mod, name, _wrapped)
    return calls


# ──────────────────────────────────────────────────────────────────────────
# Focused Panel：失败于第 2 个 Agent 发言后恢复
# ──────────────────────────────────────────────────────────────────────────
def test_resume_focused_stays_focused(monkeypatch):
    run, _ = _create(
        mode=DiscussionMode.FOCUSED_PANEL,
        rounds=1,
        selected_agents=["novelty", "reviewer"],
    )
    # intake=1, novelty=2, reviewer=3 → 在 reviewer 发言时失败
    _install_flaky(monkeypatch, fail_on={3})
    runner_mod.execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FOCUSED_PANEL, selected_agents=["novelty", "reviewer"],
    )
    failed = db.get_run(run.run_id)
    assert failed.status == RunStatus.FAILED
    assert len(failed.debate_messages) == 1  # novelty 已生成，reviewer 未生成

    # 恢复后应使用与全新执行一致的 prompt 组合：
    # focused → summary_prompt（完整 IR）+ report_prompt_focused
    focused_summary = _spy_prompt(monkeypatch, "summary_prompt_focused")
    full_summary = _spy_prompt(monkeypatch, "summary_prompt")
    focused_report = _spy_prompt(monkeypatch, "report_prompt_focused")
    runner_mod.resume_run_safe(run, rounds=1, provider=_provider(), parallel_first_round=False)

    done = db.get_run(run.run_id)
    assert done.status == RunStatus.COMPLETED, done.error
    agents = {m.agent for m in done.debate_messages}
    assert agents == {"Novelty Agent", "Reviewer Agent"}, "聚焦模式不应引入未选 Agent"
    assert "Moderator" not in agents and "Critique Agent" not in agents
    assert not done.critique_report and not done.citation_review, "聚焦模式不应生成批判/引用审查"
    assert done.final_report, "聚焦报告应生成"
    assert focused_summary["n"] == 0 and full_summary["n"] == 1
    assert focused_report["n"] == 1


# ──────────────────────────────────────────────────────────────────────────
# Quick Probe：失败后重新执行；已有回答时直接收尾
# ──────────────────────────────────────────────────────────────────────────
def test_resume_quick_probe_reruns(monkeypatch):
    run, _ = _create(mode=DiscussionMode.QUICK_PROBE, probe_agent="reviewer", probe_question="可行吗？")
    _install_flaky(monkeypatch, fail_on={1})  # 单次探测调用即失败
    runner_mod.execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[],
        mode=DiscussionMode.QUICK_PROBE, probe_agent="reviewer", probe_question="可行吗？",
    )
    assert db.get_run(run.run_id).status == RunStatus.FAILED
    assert not db.get_run(run.run_id).debate_messages

    runner_mod.resume_run_safe(run, rounds=1, provider=_provider(), parallel_first_round=False)
    done = db.get_run(run.run_id)
    assert done.status == RunStatus.COMPLETED
    assert len(done.debate_messages) == 1


def test_resume_quick_probe_with_existing_answer_finishes(monkeypatch):
    run, _ = _create(mode=DiscussionMode.QUICK_PROBE, probe_agent="novelty", probe_question="先探测")
    # 模拟：回答已写入，但最终状态写入失败导致 FAILED
    message = DebateMessage(round=1, agent="Novelty Agent", title="Quick Probe", content="已有回答")
    db.update_run(run.run_id, status=RunStatus.FAILED, debate_messages=[message], _force=True)
    run = db.get_run(run.run_id)  # 恢复入口拿到的是最新 DB 记录

    def _should_not_generate(provider, **kwargs):  # pragma: no cover
        raise AssertionError("已有回答时不应再调用模型")

    monkeypatch.setattr(runner_mod, "generate_validated", _should_not_generate)
    runner_mod.resume_run_safe(run, rounds=1, provider=_provider(), parallel_first_round=False)
    done = db.get_run(run.run_id)
    assert done.status == RunStatus.COMPLETED
    assert len(done.debate_messages) == 1
    assert done.debate_messages[0].content == "已有回答"


# ──────────────────────────────────────────────────────────────────────────
# Memory Query：恢复后仍注入记忆上下文
# ──────────────────────────────────────────────────────────────────────────
def test_resume_memory_query_injects_source_context(monkeypatch):
    src, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=1)
    runner_mod.execute_run_safe(
        src, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    assert db.get_run(src.run_id).status == RunStatus.COMPLETED

    mem_run, _ = _create(
        mode=DiscussionMode.MEMORY_QUERY, rounds=1,
        selected_agents=["novelty"], source_run_id=src.run_id,
    )
    _install_flaky(monkeypatch, fail_on={1})  # intake 阶段失败
    runner_mod.execute_run_safe(
        mem_run, rounds=1, provider=_provider(), documents=[],
        mode=DiscussionMode.MEMORY_QUERY, selected_agents=["novelty"],
    )
    assert db.get_run(mem_run.run_id).status == RunStatus.FAILED

    runner_mod.resume_run_safe(mem_run, rounds=1, provider=_provider(), parallel_first_round=False)
    done = db.get_run(mem_run.run_id)
    assert done.status == RunStatus.COMPLETED, done.error
    assert done.structured_brief is not None
    assert "记忆上下文" in done.structured_brief.intake_synthesis
    assert {m.agent for m in done.debate_messages} == {"Novelty Agent"}


# ──────────────────────────────────────────────────────────────────────────
# Full Deliberation：恢复后仍产出完整产物（防止新路由破坏原有行为）
# ──────────────────────────────────────────────────────────────────────────
def test_resume_full_still_produces_full_artifacts(monkeypatch):
    run, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=1)
    _install_flaky(monkeypatch, fail_on={3})  # intake=1, novelty=2, mechanism=3 失败
    runner_mod.execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    assert db.get_run(run.run_id).status == RunStatus.FAILED

    runner_mod.resume_run_safe(run, rounds=1, provider=_provider(), parallel_first_round=False)
    done = db.get_run(run.run_id)
    assert done.status == RunStatus.COMPLETED, done.error
    assert done.critique_report and done.citation_review and done.final_report
    assert done.structured_ir is not None


def teardown_module():
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
