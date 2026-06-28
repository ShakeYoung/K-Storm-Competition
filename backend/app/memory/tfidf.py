"""
纯 Python stdlib TF-IDF 检索引擎（无外部依赖）。

Tokenizer：字符 bigram + 标点/空白分词，适配中英混合科研文本。
相似度：TF-IDF 余弦相似度，加 entry_type 和 priority 权重提升。
"""
from __future__ import annotations

import math
import re
from collections import Counter

from app.schemas.models import MemoryEntry, MemorySearchHit


# ── Tokenizer ────────────────────────────────────────────────────────────────

_SPLIT_RE = re.compile(
    r"[\s　，。！？、；：""''（）【】《》\.,!?;:()\[\]{}/\\|@#%^&*+=<>~`\-]+"
)


def _tokenize(text: str) -> list[str]:
    """字符 bigram + 词 token 混合策略。"""
    text = text.lower()
    # 词级 token
    words = [w for w in _SPLIT_RE.split(text) if w]
    # 字符 bigram（每个词内部）
    bigrams: list[str] = []
    for w in words:
        if len(w) >= 2:
            bigrams.extend(w[i : i + 2] for i in range(len(w) - 1))
    return words + bigrams


# ── TF-IDF ───────────────────────────────────────────────────────────────────

def _tf(tokens: list[str]) -> dict[str, float]:
    count = Counter(tokens)
    total = max(len(tokens), 1)
    return {t: c / total for t, c in count.items()}


# entry_type 提升系数
_TYPE_BOOST: dict[str, float] = {
    "direction": 1.25,
    "decision_summary": 1.15,
    "key_claim": 1.05,
    "opportunity": 0.95,
    "critique": 0.85,
}


def search(
    query: str,
    entries: list[MemoryEntry],
    top_k: int = 5,
    field_filter: str = "",
    entry_types: list[str] | None = None,
) -> list[MemorySearchHit]:
    """
    TF-IDF 余弦相似度检索。

    Args:
        query:        用户查询文本
        entries:      待检索的 MemoryEntry 列表
        top_k:        返回前 k 个结果
        field_filter: 研究领域关键词过滤（空字符串 = 不过滤）
        entry_types:  只检索指定类型（空列表 = 不限类型）

    Returns:
        按 score 降序排列的 MemorySearchHit 列表（score > 0 才纳入）
    """
    if not entries or not query.strip():
        return []

    # 字段过滤
    if field_filter:
        entries = [e for e in entries if field_filter.lower() in e.field.lower()]
    # 类型过滤
    if entry_types:
        entries = [e for e in entries if e.entry_type in entry_types]
    if not entries:
        return []

    # 构建语料 tokens
    corpus: list[list[str]] = [
        _tokenize(f"{e.title} {e.content}")
        for e in entries
    ]

    # IDF（加 1 平滑，避免零除）
    N = len(corpus)
    df: Counter = Counter()
    for tokens in corpus:
        for t in set(tokens):
            df[t] += 1
    idf: dict[str, float] = {
        t: math.log((N + 1) / (c + 1)) + 1.0
        for t, c in df.items()
    }

    # 查询向量
    q_tokens = _tokenize(query)
    q_tf = _tf(q_tokens)
    q_vec = {t: q_tf[t] * idf.get(t, math.log(N + 1) + 1.0) for t in q_tf}
    q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

    hits: list[MemorySearchHit] = []
    for entry, doc_tokens in zip(entries, corpus):
        d_tf = _tf(doc_tokens)
        # 只计算查询词在文档中的投影（稀疏点积）
        dot = sum(
            q_vec[t] * d_tf[t] * idf.get(t, 1.0)
            for t in q_vec
            if t in d_tf
        )
        if dot == 0.0:
            continue

        d_norm_sq = sum(
            (d_tf[t] * idf.get(t, 1.0)) ** 2
            for t in d_tf
        )
        d_norm = math.sqrt(d_norm_sq) or 1.0
        cosine = dot / (q_norm * d_norm)

        # 加权提升
        type_boost = _TYPE_BOOST.get(entry.entry_type, 1.0)
        priority_boost = 1.0 + entry.priority * 0.02
        score = cosine * type_boost * priority_boost

        hits.append(MemorySearchHit(entry=entry, score=round(score, 6)))

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:top_k]
