"""记忆检索的 LLM 查询扩展。

把用户的原问题扩成 3-5 个同义检索词，合并 TF-IDF 结果去重，提升语义召回。
- 有可用模型时调用模型扩展
- 无模型/调用失败/超时时降级为简单的同义词规则扩展（保证离线可用）
"""
from __future__ import annotations

import re

from app.model_providers.base import ModelProvider
from app.model_providers.mock import MockModelProvider


def expand_query(query: str, provider: ModelProvider | None) -> list[str]:
    """返回扩展的同义检索词列表（不含原 query）。失败降级为规则扩展。"""
    if not query or not query.strip():
        return []
    # mock provider 没有真实推理能力，直接走规则扩展（避免无意义延迟）
    if provider is None or isinstance(provider, MockModelProvider):
        return _rule_expand(query)
    try:
        return _llm_expand(query, provider)
    except Exception:
        return _rule_expand(query)


def _llm_expand(query: str, provider: ModelProvider) -> list[str]:
    """调用模型扩展。超时/异常由上层捕获降级。"""
    text = provider.generate(
        agent_key="intake",
        system_prompt="你是检索查询扩展器。把用户的研究问题改写成 3-5 个语义等价但表述不同的检索词，用于提升召回率。只输出检索词，每行一个，不要编号和解释。",
        user_prompt=f"原始问题：{query}\n\n请输出 3-5 个同义检索词（每行一个，中英文均可）：",
        max_tokens=200,
        on_retry=None,
    )
    lines = [l.strip("-•* 1.2.3.4.5.") for l in text.splitlines() if l.strip()]
    # 去掉与原 query 完全相同的
    expanded = [l for l in lines if l and l != query][:5]
    return expanded


# 简单的中英文同义词/缩写规则
_SYNONYM_MAP = {
    "蛋白": ["蛋白质", "protein"],
    "蛋白质": ["蛋白", "protein"],
    "折叠": ["结构预测", "folding"],
    "结构预测": ["折叠", "structure prediction"],
    "免疫": ["immunity", "immune"],
    "肿瘤": ["cancer", "癌"],
    "单细胞": ["single-cell", "scRNA"],
    "机器学习": ["machine learning", "ML", "深度学习"],
    "深度学习": ["deep learning", "神经网络", "machine learning"],
    "催化": ["catalysis", "catalyst"],
    "材料": ["material", "材料科学"],
}


def _rule_expand(query: str) -> list[str]:
    """基于简单同义词表的规则扩展（离线兜底）。"""
    expanded: list[str] = []
    lowered = query.lower()
    for key, synonyms in _SYNONYM_MAP.items():
        if key in query or key.lower() in lowered:
            expanded.extend(synonyms)
    # 去重 + 去掉与原 query 相同的
    seen = {query.lower()}
    result = []
    for e in expanded:
        if e.lower() not in seen:
            seen.add(e.lower())
            result.append(e)
    return result[:5]
