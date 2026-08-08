"""外部引用提取单元测试：显式「外部引用」小节 + 正则 fallback 两条路径。"""
from __future__ import annotations

from app.orchestrator.runner import extract_references
from app.schemas.models import DebateMessage


def _msg(agent: str, round_num: int, content: str) -> DebateMessage:
    return DebateMessage(round=round_num, agent=agent, title=f"第 {round_num} 轮", content=content)


EXPLICIT_CONTENT = """**观点主体**

### 给结构化 IR 的要点摘要
- 关键主张：xxx

### 外部引用
[paper] Deep learning for genomics | Zhang et al. | https://doi.org/10.1000/xyz | 2024 | 支撑观点 A
[dataset] TCGA 公共数据 | TCGA Consortium | https://portal.gdc.cancer.gov | 2023 | 支撑观点 B
"""


def test_explicit_section_parses_types_and_fields():
    refs = extract_references([_msg("Novelty Agent", 1, EXPLICIT_CONTENT)])
    assert len(refs) == 2
    paper = next(r for r in refs if r.source_type == "paper")
    dataset = next(r for r in refs if r.source_type == "dataset")
    assert paper.title == "Deep learning for genomics"
    assert paper.authors == "Zhang et al."
    assert paper.url == "https://doi.org/10.1000/xyz"
    assert paper.year == "2024"
    assert paper.citing_agent == "Novelty Agent"
    assert paper.round == 1
    assert dataset.url == "https://portal.gdc.cancer.gov"


def test_dedup_by_url_across_messages():
    refs = extract_references([
        _msg("Novelty Agent", 1, EXPLICIT_CONTENT),
        _msg("Reviewer Agent", 1, EXPLICIT_CONTENT.replace("支撑观点 B", "支撑观点 C")),
    ])
    assert len(refs) == 2, "same URLs must be deduplicated"
    assert {r.url for r in refs} == {"https://doi.org/10.1000/xyz", "https://portal.gdc.cancer.gov"}


def test_pending_url_treated_as_no_url_and_deduped_by_title():
    content = """### 外部引用
[paper] 待核验论文标题 | Author | 待确认 | 2023 | 观点
"""
    refs = extract_references([_msg("Mechanism Agent", 2, content)])
    assert len(refs) == 1
    # 「待确认」仅用于去重归一化；存储保留原文，便于前端展示"待人工补充链接"
    assert refs[0].url == "待确认"
    # 相同标题的第二条不应重复入库
    refs2 = extract_references([_msg("Mechanism Agent", 2, content), _msg("Mechanism Agent", 3, content)])
    assert len(refs2) == 1


FALLBACK_CONTENT = """**观点主体**

该方向有 https://arxiv.org/abs/2401.12345 和 https://example.org/some-paper 支撑，
参见《深度学习方法综述》(2022) 以及 Smith et al. (2021) 的结论。

### 给结构化 IR 的要点摘要
- 关键主张：https://example.org/should-not-appear 不应被提取
"""


def test_fallback_extracts_url_arxiv_and_cn_titles():
    refs = extract_references([_msg("Novelty Agent", 1, FALLBACK_CONTENT)])
    urls = {r.url for r in refs if r.url}
    assert "https://arxiv.org/abs/2401.12345" in urls
    assert "https://example.org/some-paper" in urls
    assert "https://example.org/should-not-appear" not in urls, "IR 摘要小节内的链接不应被 fallback 提取"
    titles = {r.title for r in refs}
    assert any("深度学习方法综述" in t for t in titles)
    assert any("Smith et al. (2021)" in t or "Smith" in t for t in titles)


def test_empty_messages_returns_empty():
    assert extract_references([]) == []
