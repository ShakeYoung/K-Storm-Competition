"""核验分发器：按引用的 URL/DOI/标题路由到 arXiv / Crossref / OpenReview。

纯函数入口：verify_references(refs) -> list[ReferenceVerification]
- 无 URL/DOI 的 paper 标 pending（待人工核实）
- 非 paper/blog/dataset 默认 skip
- 串行调用（尊重公开 API 限速）；单条失败不影响其他
"""
from __future__ import annotations

import time
from datetime import datetime, UTC

from app.schemas.models import ExternalReference
from app.verification.schemas import ReferenceVerification
from app.verification.sources import arxiv, crossref, openreview

# 核验间隔（秒），尊重公开 API 限速
_INTER_SOURCE_DELAY = 1.0


def verify_references(
    refs: list[ExternalReference],
    sources: list[str] | None = None,
) -> list[ReferenceVerification]:
    """对一组引用执行在线核验，返回与 refs 等长的结果列表。

    Args:
        refs: 待核验的 ExternalReference 列表
        sources: 限定使用的源（如 ["arxiv","crossref"]）；None = 全部
    """
    enabled = sources or ["arxiv", "crossref", "openreview"]
    results: list[ReferenceVerification] = []
    for i, ref in enumerate(refs):
        if i > 0:
            time.sleep(_INTER_SOURCE_DELAY)
        results.append(_verify_one(ref, enabled))
    return results


def _verify_one(ref: ExternalReference, enabled: list[str]) -> ReferenceVerification:
    """单条引用核验：按优先级尝试各源，首个有结论即返回。"""
    # 非 paper/blog/dataset 类型默认跳过
    if ref.source_type not in {"paper", "blog", "dataset", "book"}:
        return ReferenceVerification(status="skipped", source="none", detail=f"类型 {ref.source_type} 不在核验范围")

    url = ref.url or ""
    title = ref.title or ""
    authors = ref.authors or ""
    year = ref.year or ""

    # 显式 arXiv id 优先走 arXiv
    if "arxiv" in enabled and arxiv.extract_arxiv_id(url) or arxiv.extract_arxiv_id(title):
        return arxiv.verify(title, url, authors, year)

    # 有 DOI 优先走 Crossref
    if "crossref" in enabled and crossref.extract_doi(url):
        return crossref.verify(title, url, authors, year)

    # OpenReview 链接走 OpenReview
    if "openreview" in enabled and "openreview.net" in url.lower():
        return openreview.verify(title, url, authors, year)

    # 有 URL 但非上述来源：尝试 Crossref 按 URL 提取 DOI，失败标 pending
    if "crossref" in enabled and url:
        result = crossref.verify(title, url, authors, year)
        if result.status != "skipped":
            return result

    # 无任何可核验标识：标 pending
    return ReferenceVerification(
        status="pending",
        source="none",
        detail="缺少 DOI/arXiv id/OpenReview 链接，需人工核验",
        verified_at=datetime.now(UTC).isoformat(),
    )
