"""StructuredIR 解析与回退逻辑单元测试（纯函数，无需 DB）。"""
from __future__ import annotations

from app.orchestrator.runner import (
    clean_structured_ir_markdown,
    parse_structured_ir_v2,
    validate_structured_ir,
)
from app.schemas.models import DebateMessage, StructuredBrief, TemplateInput

TEMPLATE = TemplateInput(field="测试领域", background="研究背景", existing_basis="已有基础")
BRIEF = StructuredBrief(
    research_context="研究上下文",
    known_facts=["事实 1"],
    intake_synthesis="入口整合内容",
)

VALID_IR = {
    "version": "1.5",
    "decision_summary": "建议优先推进方向 A",
    "key_claims": ["主张 1"],
    "evidence_refs": [
        {"id": "e1", "source_type": "template", "source_title": "用户模板", "quote_or_summary": "已有基础", "supports": "背景依据"},
    ],
    "critique_points": [
        {"id": "c1", "dimension": "创新性", "severity": "medium", "content": "创新边界需明确"},
    ],
    "candidate_directions": [
        {
            "id": "d1", "title": "方向 A", "research_question": "问题 A",
            "rationale": "理由", "novelty": "高", "feasibility": "中",
            "priority": 1, "evidence_refs": ["e1"], "critique_refs": ["c1"],
        },
    ],
}


def _message(agent: str, content: str) -> DebateMessage:
    return DebateMessage(round=1, agent=agent, title="第 1 轮", content=content)


def test_parse_valid_fenced_json():
    raw = f"```json\n{__import__('json').dumps(VALID_IR, ensure_ascii=False)}\n```\n\n## 结构化 IR 文档\n\n正文内容"
    ir = parse_structured_ir_v2(raw, TEMPLATE, BRIEF, [])
    assert ir.version == "1.5"
    assert len(ir.candidate_directions) == 1
    assert ir.candidate_directions[0].evidence_refs == ["e1"]


def test_parse_malformed_json_falls_back():
    raw = "## 结构化 IR 文档\n\n### 候选方向\n1. 方向甲\n2. 方向乙\n\n### 决策摘要\nxxx"
    ir = parse_structured_ir_v2(raw, TEMPLATE, BRIEF, [_message("Novelty Agent", "建议做机制研究")])
    assert ir.candidate_directions, "fallback must still produce candidate directions"
    assert ir.version == "1.5"
    ids = {d.id for d in ir.candidate_directions}
    assert "D1" in ids
    # fallback 证据 ID 必须存在于 evidence_refs（否则 validate 会报警告）
    warnings = validate_structured_ir(ir)
    assert not any("不存在于 evidence_refs" in w for w in warnings), warnings


def test_clean_structured_ir_markdown_strips_json_block():
    raw = f"```json\n{__import__('json').dumps(VALID_IR, ensure_ascii=False)}\n```\n\n## 结构化 IR 文档\n\n保留的正文"
    cleaned = clean_structured_ir_markdown(raw)
    assert "candidate_directions" not in cleaned
    assert "保留的正文" in cleaned


def test_clean_structured_ir_markdown_lone_json_returns_markdown():
    raw = __import__('json').dumps(VALID_IR, ensure_ascii=False)
    cleaned = clean_structured_ir_markdown(raw)
    assert cleaned == "", "纯 JSON 输出（无 Markdown 段）应返回空，由前端兜底展示"


def test_validate_structured_ir_detects_dangling_refs():
    import json as _json
    bad = {**VALID_IR, "candidate_directions": [
        {"id": "d1", "title": "方向 A", "evidence_refs": ["missing-ref"], "critique_refs": []},
    ]}
    raw = f"```json\n{_json.dumps(bad, ensure_ascii=False)}\n```"
    ir = parse_structured_ir_v2(raw, TEMPLATE, BRIEF, [])
    warnings = validate_structured_ir(ir)
    assert any("missing-ref" in w for w in warnings), warnings
