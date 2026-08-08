"""OpenReview 核验（尽力 + 降级）。

OpenReview API v2 默认需 cookie 认证，且实测会 302 跳转人机校验。
策略：尝试 GET，成功才比对；遇跳转/401/超时一律标 pending，不报错。
"""
from __future__ import annotations

import json
import re
import urllib.request
import urllib.error
from datetime import datetime, UTC

from app.verification.schemas import ReferenceVerification

_API = "https://api2.openreview.net/notes"


def verify(ref_title: str, ref_url: str, ref_authors: str = "", ref_year: str = "") -> ReferenceVerification:
    if not ref_title or len(ref_title) < 5:
        return ReferenceVerification(status="skipped", source="openreview", detail="标题过短，跳过")
    if "openreview.net" not in (ref_url or "").lower() and "openreview" not in (ref_title or "").lower():
        # 非显式 OpenReview 链接，不做无差别标题查询（避免误匹配）
        return ReferenceVerification(status="skipped", source="openreview", detail="非 OpenReview 来源，跳过")

    try:
        import urllib.parse as up
        params = up.urlencode({"content.title": ref_title, "limit": 3})
        url = f"{_API}?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "K-Storm-reference-verifier/1.0"}, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return ReferenceVerification(status="pending", source="openreview", detail=f"OpenReview HTTP {exc.code}（可能需认证）")
    except Exception as exc:
        msg = str(exc)
        if "challenge" in msg.lower() or "redirect" in msg.lower() or "302" in msg:
            return ReferenceVerification(status="pending", source="openreview", detail="OpenReview 触发人机校验，需人工核验")
        return ReferenceVerification(status="pending", source="openreview", detail=f"OpenReview 请求异常: {exc}")

    notes = data.get("notes") or []
    if not notes:
        return ReferenceVerification(status="not_found", source="openreview", detail="OpenReview 未找到匹配", verified_at=datetime.now(UTC).isoformat())

    # 取最相似的
    best = notes[0]
    content = best.get("content") or {}
    matched_title = content.get("title", "")
    if isinstance(matched_title, list):
        matched_title = matched_title[0] if matched_title else ""
    authors_data = content.get("authors") or []
    if isinstance(authors_data, list) and authors_data and isinstance(authors_data[0], dict):
        matched_authors = ", ".join(a.get("username", str(a)) for a in authors_data[:8])[:160]
    else:
        matched_authors = ", ".join(str(a) for a in (authors_data if isinstance(authors_data, list) else [authors_data]))[:160]

    status = _classify_match(ref_title, str(matched_title))
    return ReferenceVerification(
        status=status,
        source="openreview",
        matched_title=str(matched_title)[:200],
        matched_authors=matched_authors,
        detail=f"OpenReview id={best.get('id','')} | 标题比对: {status}",
        verified_at=datetime.now(UTC).isoformat(),
    )


def _classify_match(ref_title: str, matched_title: str) -> str:
    if not matched_title:
        return "not_found"
    ref_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", ref_title) if len(t) > 1}
    match_tokens = {t.lower() for t in re.split(r"[\s,.;:()\[\]]+", matched_title) if len(t) > 1}
    if not ref_tokens:
        return "verified"
    overlap = len(ref_tokens & match_tokens) / len(ref_tokens)
    return "verified" if overlap >= 0.4 else "mismatch"
