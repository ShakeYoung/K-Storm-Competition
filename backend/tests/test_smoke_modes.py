"""Smoke tests for the five discussion modes using the mock provider.

These run the full orchestrator against an isolated temp SQLite database and a
mock model provider, asserting that each mode produces its key artifacts and
that the upgrade path really carries context forward (regression guard for the
upgrade_from_run_id persistence bug).

Run with: cd backend && python -m pytest tests/ -q
(or: python -m pytest tests/test_smoke_modes.py -q)
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

# Patch the DB path to a temp dir BEFORE importing anything that touches storage.
_TMP_DIR = tempfile.mkdtemp(prefix="ks_smoke_")
import os
os.environ["K_STORM_DATA_DIR"] = _TMP_DIR

# Speed up the mock provider (it sleeps 0.3s per call otherwise).
import app.model_providers.mock as _mock_mod
_orig_generate = _mock_mod.MockModelProvider.generate


def _fast_generate(self, *, agent_key, system_prompt, user_prompt, max_tokens=None, on_retry=None):
    return _orig_generate(
        self,
        agent_key=agent_key,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=max_tokens,
        on_retry=on_retry,
    )


_mock_mod.MockModelProvider.generate = _fast_generate
_mock_mod.time.sleep = lambda *_a, **_kw: None  # type: ignore[attr-defined]

from app.schemas.models import (  # noqa: E402
    DiscussionMode,
    ResearchStage,
    RunCreate,
    TemplateInput,
)
from app.storage import db  # noqa: E402
from app.model_providers.mock import MockModelProvider  # noqa: E402
from app.orchestrator.runner import (  # noqa: E402
    create_run_record,
    execute_run_safe,
    inject_upgrade_context,
)


TEMPLATE = TemplateInput(
    field="测试领域",
    background="研究背景：多智能体科研选题",
    existing_basis="已有基础：原型系统与若干数据",
    extension_points="延伸：结构化 IR 与批判审查",
    core_question="核心问题：如何把多 Agent 讨论收敛为可执行选题？",
    platforms="Python / FastAPI / React",
    constraints="时间 2 周；无外部 API 费用",
    target_output="开题报告",
    preferred_direction="机制研究",
)


@pytest.fixture(autouse=True)
def _init_db():
    db.init_db()
    yield


def _provider():
    return MockModelProvider()


def _create(template=TEMPLATE, **kwargs):
    payload = RunCreate(template_input=template, **kwargs)
    run = create_run_record(payload)
    return run, payload


# ──────────────────────────────────────────────────────────────────────────
# 1. Full deliberation
# ──────────────────────────────────────────────────────────────────────────
def test_full_deliberation_produces_all_artifacts():
    run, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=1)
    execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    done = db.get_run(run.run_id)
    assert done.status == "COMPLETED", f"expected COMPLETED, got {done.status} ({done.error})"
    assert done.structured_brief is not None and done.structured_brief.intake_synthesis
    assert len(done.debate_messages) >= 4, "debate should have >= 4 agent messages"
    assert done.group_summary, "group_summary missing"
    assert done.critique_report, "critique_report missing"
    assert done.citation_review, "citation_review missing"
    assert done.final_report, "final_report missing"
    assert done.structured_ir is not None, "structured_ir missing"
    assert done.structured_ir.candidate_directions, "no candidate directions"


# ──────────────────────────────────────────────────────────────────────────
# 2. Focused panel
# ──────────────────────────────────────────────────────────────────────────
def test_focused_panel_runs_selected_agents():
    run, _ = _create(
        mode=DiscussionMode.FOCUSED_PANEL,
        rounds=1,
        selected_agents=["novelty", "reviewer"],
    )
    execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FOCUSED_PANEL, selected_agents=["novelty", "reviewer"],
    )
    done = db.get_run(run.run_id)
    assert done.status == "COMPLETED", f"got {done.status} ({done.error})"
    agents = {m.agent for m in done.debate_messages}
    assert "Novelty Agent" in agents and "Reviewer Agent" in agents
    assert done.final_report, "focused panel should still produce a report"


# ──────────────────────────────────────────────────────────────────────────
# 3. Quick probe
# ──────────────────────────────────────────────────────────────────────────
def test_quick_probe_single_agent_answer():
    run, _ = _create(
        mode=DiscussionMode.QUICK_PROBE,
        probe_agent="reviewer",
        probe_question="这个方向可行吗？",
    )
    execute_run_safe(
        run, rounds=1, provider=_provider(), documents=[],
        mode=DiscussionMode.QUICK_PROBE, probe_agent="reviewer", probe_question="这个方向可行吗？",
    )
    done = db.get_run(run.run_id)
    assert done.status == "COMPLETED", f"got {done.status} ({done.error})"
    assert len(done.debate_messages) == 1
    assert "可行" in done.debate_messages[0].content or done.debate_messages[0].content


# ──────────────────────────────────────────────────────────────────────────
# 4. Memory query (focused-style path with a source run)
# ──────────────────────────────────────────────────────────────────────────
def test_memory_query_carries_source_context():
    # First, create and complete a full run as the source.
    src, _ = _create(mode=DiscussionMode.FULL_DELIBERATION, rounds=1)
    execute_run_safe(
        src, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    src_done = db.get_run(src.run_id)
    assert src_done.status == "COMPLETED"

    # Now start a memory-style run referencing the source.
    mem_run, _ = _create(
        mode=DiscussionMode.MEMORY_QUERY,
        rounds=1,
        selected_agents=["novelty"],
        source_run_id=src.run_id,
    )
    execute_run_safe(
        mem_run, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.MEMORY_QUERY, selected_agents=["novelty"],
    )
    done = db.get_run(mem_run.run_id)
    assert done.status == "COMPLETED", f"got {done.status} ({done.error})"
    assert done.source_run_id == src.run_id
    assert done.structured_brief is not None
    # The memory path injects source brief/IR into intake_synthesis.
    assert "记忆上下文" in done.structured_brief.intake_synthesis, "source context not injected"


# ──────────────────────────────────────────────────────────────────────────
# 5. Upgrade path: upgrade_from_run_id is persisted AND injects context
#    (regression guard for the persistence bug)
# ──────────────────────────────────────────────────────────────────────────
def test_upgrade_persists_and_injects_context():
    # Source: a completed quick probe.
    src, _ = _create(
        mode=DiscussionMode.QUICK_PROBE,
        probe_agent="novelty",
        probe_question="先快速探测一下",
    )
    execute_run_safe(
        src, rounds=1, provider=_provider(), documents=[],
        mode=DiscussionMode.QUICK_PROBE, probe_agent="novelty", probe_question="先快速探测一下",
    )
    src_done = db.get_run(src.run_id)
    assert src_done.status == "COMPLETED"

    # Upgraded run references the source via upgrade_from_run_id.
    upgraded, payload = _create(
        mode=DiscussionMode.FULL_DELIBERATION,
        rounds=1,
        upgrade_from_run_id=src.run_id,
    )

    # 1. The id is persisted and read back from the DB.
    reloaded = db.get_run(upgraded.run_id)
    assert reloaded.upgrade_from_run_id == src.run_id, (
        "upgrade_from_run_id not persisted — the original bug"
    )

    # 2. inject_upgrade_context actually appends context to the brief.
    #    In the real pipeline the brief is built by the intake step before
    #    injection, so mirror that here (a freshly-created run has no brief yet).
    from app.orchestrator.runner import build_structured_brief
    brief = build_structured_brief(reloaded.template_input, reloaded.documents or [])
    inject_upgrade_context(reloaded, brief)
    assert "升级上下文" in brief.intake_synthesis, (
        "upgrade context was not injected into intake_synthesis"
    )

    # 3. Running the upgraded full run completes and carries the context through.
    execute_run_safe(
        reloaded, rounds=1, provider=_provider(), documents=[], parallel_first_round=False,
        mode=DiscussionMode.FULL_DELIBERATION,
    )
    done = db.get_run(upgraded.run_id)
    assert done.status == "COMPLETED", f"got {done.status} ({done.error})"
    assert "升级上下文" in done.structured_brief.intake_synthesis


def teardown_module():
    """Clean up the temp DB dir after the suite runs."""
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
