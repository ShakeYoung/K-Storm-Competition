"""Crossref 核验：从 URL 提取 DOI，查 api.crossref.org，返回元数据比对。

Crossref REST: https://api.crossref.org/works/<doi>  返回 JSON message。
公共访问无需 Key；加 mailto 走 polite pool。
"""
from __future__ import annotations

import re
from datetime import datetime, UTC

from app.verification.http_client import json_get_with_retry
from app.verification.schemas import ReferenceVerification

_DOI_RE = re.compile(r"(?:doi\.org/|doi:|doi=)(10\.\d{4,9}/[^\s\"'<>]+)", re.IGNORECASE)
_BARE_DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"'<>]+)")


def extract_doi(text: str) -> str:
    if not text:
        return ""
    m = _DOI_RE.search(text) or _BARE_DOI_RE.search(text)
    return (m.group(1) if m else "").rstrip(").,;")


def verify(ref_title: str, ref_url: str, ref_authors: str = "", ref_year: str = "") -> ReferenceVerification:
    doi = extract_doi(ref_url) or extract_doi(ref_title)
    if not doi:
        return ReferenceVerification(status="skipped", source="crossref", detail="无 DOI，跳过")

    try:
        data = json_get_with_retry(
            f"https://api.crossref.org/works/{doi}",
            headers={"User-Agent": "K-Storm-reference-verifier/1.0 (mailto:k-storm@example.com)"},
            timeout=20,
        )
    except RuntimeError as exc:
        msg = str(exc)
        if "404" in msg:
            return ReferenceVerification(status="not_found", source="crossref", detail=f"Crossref 未找到 DOI={doi}", verified_at=datetime.now(UTC).isoformat())
        return ReferenceVerification(status="pending", source="crossref", detail=f"Crossref 请求失败: {exc}")

    message = data.get("message") or {}
    titles = message.get("title") or []
    matched_title = titles[0] if titles else ""
    authors_data = message.get("author") or []
    matched_authors = ", ".join(
        f"{a.get('given','')} {a.get('family','')}".strip() for a in authors_data[:8]
    )[:160]
    published = message.get("published", {}).get("date-parts", [[None]])[0]
    matched_year = str(published[0]) if published and published[0] else ""

    status = _classify_match(ref_title, matched_title, ref_authors, matched_authors)
    return ReferenceVerification(
        status=status,
        source="crossref",
        matched_title=matched_title[:200],
        matched_authors=matched_authors,
        matched_year=matched_year,
        detail=f"DOI={doi} | 标题比对: {status}",
        verified_at=datetime.now(UTC).isoformat(),
    )


def _classify_match(ref_title: str, matched_title: str, ref_authors: str, matched_authors: str) -> str:
    if not matched_title:
        return "not_found"
    ref_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", ref_title) if len(t) > 1}
    match_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", matched_title) if len(t) > 1}
    if not ref_tokens:
        return "verified"
    overlap = len(ref_tokens & match_tokens) / len(ref_tokens)
    if overlap >= 0.4:
        return "verified"
    if ref_authors:
        ref_surnames = {w for w in ref_authors.lower().replace(",", " ").split() if len(w) > 2}
        if ref_surnames & {w.split()[-1].lower() for w in matched_authors.lower().split(",") if w.strip()}:
            return "verified"
    return "mismatch"
