"""TF-IDF 跨 Run 记忆检索引擎单元测试（纯函数，无需 DB）。"""
from __future__ import annotations

from app.memory.tfidf import search
from app.schemas.models import MemoryEntry


def _entry(
    entry_id: str,
    field: str,
    entry_type: str,
    title: str,
    content: str,
    priority: int = 0,
) -> MemoryEntry:
    return MemoryEntry(
        entry_id=entry_id,
        source_run_id="run1",
        run_name="测试 Run",
        field=field,
        entry_type=entry_type,
        title=title,
        content=content,
        priority=priority,
        created_at="2026-01-01T00:00:00+00:00",
    )


ENTRIES = [
    _entry(
        "e1", "肿瘤微环境", "direction", "巨噬细胞极化方向",
        "肿瘤相关巨噬细胞从 M1 向 M2 极化促进免疫逃逸，可通过单细胞测序验证。", priority=1,
    ),
    _entry(
        "e2", "肿瘤微环境", "key_claim", "关键主张 1",
        "免疫检查点抑制剂联合巨噬细胞重极化可能增强抗肿瘤疗效。", priority=5,
    ),
    _entry(
        "e3", "材料科学", "direction", "钙钛矿稳定性方向",
        "钙钛矿太阳能电池的离子迁移导致器件退化，需要封装与组分工程。", priority=1,
    ),
    _entry(
        "e4", "材料科学", "critique", "批判点",
        "钙钛矿方向证据链薄弱，需要原位表征补充。", priority=0,
    ),
]


def test_returns_relevant_hits_sorted_by_score():
    hits = search("巨噬细胞极化 免疫逃逸", ENTRIES, top_k=5)
    assert hits, "should return at least one hit"
    assert hits[0].entry.entry_id == "e1", "most relevant entry should rank first"
    scores = [h.score for h in hits]
    assert scores == sorted(scores, reverse=True), "scores must be descending"


def test_top_k_limits_results():
    hits = search("巨噬细胞", ENTRIES, top_k=1)
    assert len(hits) == 1


def test_field_filter_restricts_corpus():
    hits = search("钙钛矿", ENTRIES, top_k=5, field_filter="材料科学")
    assert hits and all(h.entry.field == "材料科学" for h in hits)


def test_entry_type_filter():
    hits = search("巨噬细胞", ENTRIES, top_k=5, entry_types=["key_claim"])
    assert hits and all(h.entry.entry_type == "key_claim" for h in hits)


def test_empty_query_returns_empty():
    assert search("", ENTRIES, top_k=5) == []
    assert search("   ", ENTRIES, top_k=5) == []


def test_priority_boost_breaks_ties():
    same_content = "蛋白互作网络揭示核心调控模块"
    low = _entry("p0", "领域", "direction", "低优先", same_content, priority=0)
    high = _entry("p5", "领域", "direction", "高优先", same_content, priority=5)
    hits = search("蛋白互作 调控模块", [low, high], top_k=2)
    assert len(hits) == 2
    assert hits[0].entry.entry_id == "p5", "higher priority should rank first on ties"
    assert hits[0].score > hits[1].score
