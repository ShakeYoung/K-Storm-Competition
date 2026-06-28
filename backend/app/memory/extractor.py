"""
从已完成的 RunRecord 中提取 MemoryEntry 列表，供 TF-IDF 索引使用。

提取来源：
  - StructuredIRV2.decision_summary      → entry_type="decision_summary"
  - StructuredIRV2.key_claims            → entry_type="key_claim"
  - StructuredIRV2.candidate_directions  → entry_type="direction"
  - StructuredIRV2.critique_points       → entry_type="critique"
  - StructuredBrief.opportunity_points   → entry_type="opportunity"
"""
from __future__ import annotations

from app.schemas.models import MemoryEntry, RunRecord


def extract_memory_entries(run: RunRecord) -> list[MemoryEntry]:
    """从单个 RunRecord 中提取全部 MemoryEntry。"""
    entries: list[MemoryEntry] = []
    field = run.template_input.field
    ts = run.created_at
    run_name = run.run_name or run.run_id[:8]

    ir = run.structured_ir
    brief = run.structured_brief

    # 1. decision_summary
    if ir and ir.decision_summary:
        entries.append(MemoryEntry(
            entry_id=f"{run.run_id}:decision:0",
            source_run_id=run.run_id,
            run_name=run_name,
            field=field,
            entry_type="decision_summary",
            title="决策摘要",
            content=ir.decision_summary,
            priority=10,
            created_at=ts,
        ))

    # 2. key_claims
    if ir:
        for i, claim in enumerate(ir.key_claims):
            if not claim.strip():
                continue
            entries.append(MemoryEntry(
                entry_id=f"{run.run_id}:claim:{i}",
                source_run_id=run.run_id,
                run_name=run_name,
                field=field,
                entry_type="key_claim",
                title=f"关键主张 {i + 1}",
                content=claim,
                priority=5,
                created_at=ts,
            ))

    # 3. candidate_directions
    if ir:
        for d in ir.candidate_directions:
            content_parts = [d.title, d.research_question, d.rationale, d.novelty, d.feasibility]
            content = " ".join(p for p in content_parts if p)
            if not content.strip():
                continue
            entries.append(MemoryEntry(
                entry_id=f"{run.run_id}:dir:{d.id}",
                source_run_id=run.run_id,
                run_name=run_name,
                field=field,
                entry_type="direction",
                title=d.title or "候选方向",
                content=content,
                priority=d.priority,
                created_at=ts,
            ))

    # 4. critique_points
    if ir:
        for cp in ir.critique_points:
            content = f"{cp.content} {cp.mitigation}".strip()
            if not content:
                continue
            entries.append(MemoryEntry(
                entry_id=f"{run.run_id}:critique:{cp.id}",
                source_run_id=run.run_id,
                run_name=run_name,
                field=field,
                entry_type="critique",
                title=cp.dimension or "批判点",
                content=content,
                priority=0,
                created_at=ts,
            ))

    # 5. opportunity_points from brief
    if brief:
        for i, op in enumerate(brief.opportunity_points):
            if not op.strip():
                continue
            entries.append(MemoryEntry(
                entry_id=f"{run.run_id}:opp:{i}",
                source_run_id=run.run_id,
                run_name=run_name,
                field=field,
                entry_type="opportunity",
                title=f"机会点 {i + 1}",
                content=op,
                priority=0,
                created_at=ts,
            ))

    return entries
