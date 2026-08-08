"""arXiv 核验：从 URL/文本提取 arXiv id，查 export.arxiv.org API，返回元数据比对。

arXiv API: http://export.arxiv.org/api/query?id_list=<id>  返回 Atom XML。
限速建议：单次请求间隔 ≥3s（本模块由 verify.py 控制并发，这里不内建 sleep）。
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, UTC

from app.verification.http_client import text_get_with_retry
from app.verification.schemas import ReferenceVerification

_ARXIV_ID_RE = re.compile(r"(?:arXiv:?\s*|arxiv\.org/abs/|arxiv\.org/pdf/)(\d{4}\.\d{4,5})", re.IGNORECASE)
_ATOM_NS = "{http://www.w3.org/2005/Atom}"


def extract_arxiv_id(text: str) -> str:
    """从 URL 或文本中提取 arXiv id（如 1605.08386）。无则返回空串。"""
    if not text:
        return ""
    m = _ARXIV_ID_RE.search(text)
    return m.group(1) if m else ""


def verify(ref_title: str, ref_url: str, ref_authors: str = "", ref_year: str = "") -> ReferenceVerification:
    """核验单条引用是否存在于 arXiv。失败降级为 pending。"""
    arxiv_id = extract_arxiv_id(ref_url) or extract_arxiv_id(ref_title)
    if not arxiv_id:
        return ReferenceVerification(status="skipped", source="arxiv", detail="无 arXiv id，跳过")

    try:
        xml_text = text_get_with_retry(
            f"https://export.arxiv.org/api/query?id_list={arxiv_id}",
            timeout=20,
        )
    except RuntimeError as exc:
        return ReferenceVerification(status="pending", source="arxiv", detail=f"arXiv 请求失败: {exc}")

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        return ReferenceVerification(status="pending", source="arxiv", detail=f"arXiv 响应解析失败: {exc}")

    entries = root.findall(f"{_ATOM_NS}entry")
    if not entries:
        return ReferenceVerification(status="not_found", source="arxiv", detail=f"arXiv 未找到 id={arxiv_id}", verified_at=datetime.now(UTC).isoformat())

    entry = entries[0]
    matched_title = (entry.findtext(f"{_ATOM_NS}title") or "").strip()
    authors = [a.findtext(f"{_ATOM_NS}name") for a in entry.findall(f"{_ATOM_NS}author")]
    matched_authors = ", ".join(a for a in authors if a)[:160]
    published = (entry.findtext(f"{_ATOM_NS}published") or "")[:4]

    # 比对：标题相似度（token 重叠）+ 作者姓氏匹配
    status = _classify_match(ref_title, matched_title, ref_authors, matched_authors)
    return ReferenceVerification(
        status=status,
        source="arxiv",
        matched_title=matched_title[:200],
        matched_authors=matched_authors,
        matched_year=published,
        detail=f"arXiv id={arxiv_id} | 标题比对: {status}",
        verified_at=datetime.now(UTC).isoformat(),
    )


def _classify_match(ref_title: str, matched_title: str, ref_authors: str, matched_authors: str) -> str:
    """简单 token 重叠判定。>40% 视为 verified，否则 mismatch。"""
    if not matched_title:
        return "not_found"
    ref_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", ref_title) if len(t) > 1}
    match_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", matched_title) if len(t) > 1}
    if not ref_tokens:
        return "verified"  # 无原标题可比，但 arXiv 确实存在该 id
    overlap = len(ref_tokens & match_tokens) / len(ref_tokens)
    if overlap >= 0.4:
        return "verified"
    # 作者姓氏兜底
    if ref_authors:
        ref_surnames = {w for w in ref_authors.lower().replace(",", " ").split() if len(w) > 2}
        if ref_surnames & {w.split()[-1].lower() for w in matched_authors.lower().split(",") if w.strip()}:
            return "verified"
    return "mismatch"
