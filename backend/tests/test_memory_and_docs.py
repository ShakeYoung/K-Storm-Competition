"""记忆检索查询扩展 + 大文档省略点提取 单元测试（纯函数，无网络）。"""
from __future__ import annotations

from app.memory.query_expander import expand_query, _rule_expand
from app.orchestrator.prompts import extract_omitted_notes


# ── 查询扩展（规则降级）────────────────────────────────────────────────────

def test_rule_expand_protein_synonyms():
    expanded = _rule_expand("蛋白质折叠预测")
    assert "蛋白" in expanded
    assert "protein" in expanded


def test_rule_expand_dedup_and_limit():
    expanded = _rule_expand("单细胞 肿瘤 免疫")
    # 去重
    assert len(expanded) == len(set(expanded))
    assert len(expanded) <= 5


def test_expand_query_with_none_provider_uses_rule():
    result = expand_query("机器学习", None)
    assert isinstance(result, list)
    assert "machine learning" in result or "ML" in result


def test_expand_query_empty_returns_empty():
    assert expand_query("", None) == []
    assert expand_query("   ", None) == []


def test_expand_query_strips_duplicates_with_original():
    result = expand_query("蛋白", None)
    assert "蛋白" not in result  # 原词不应出现在扩展结果


# ── 省略点提取 ─────────────────────────────────────────────────────────────

def test_extract_omitted_notes_from_intake_output():
    content = """## 研究背景压缩

入口整合内容...

## 因预算省略的关键点
- 文档第 5 章的补充实验设计未进入摘要
- 表 3 的批次效应原始数据被裁切
- 附录中的统计学方法细节

## 已知事实
- 平台可用
"""
    notes = extract_omitted_notes(content)
    assert len(notes) == 3
    assert any("补充实验" in n for n in notes)
    assert any("批次效应" in n for n in notes)


def test_extract_omitted_notes_empty_when_no_section():
    content = "普通 intake 输出，无省略点小节"
    assert extract_omitted_notes(content) == []


def test_extract_omitted_notes_empty_content():
    assert extract_omitted_notes("") == []
    assert extract_omitted_notes(None) == []
