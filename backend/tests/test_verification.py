"""引用核验模块单元测试（不依赖网络：mock source / 纯函数 / 离线降级）。

覆盖：
- arxiv.extract_arxiv_id / crossref.extract_doi 纯函数
- verify_references 分发逻辑（无网络时各状态判定）
- 离线降级（网络失败 → pending）
"""
from __future__ import annotations

from unittest.mock import patch

from app.schemas.models import ExternalReference
from app.verification.schemas import ReferenceVerification
from app.verification.sources import arxiv, crossref
from app.verification.verify import verify_references, _verify_one


# ── 纯函数：id/doi 提取 ──────────────────────────────────────────────────────

def test_arxiv_extract_from_url():
    assert arxiv.extract_arxiv_id("https://arxiv.org/abs/1706.03762") == "1706.03762"
    assert arxiv.extract_arxiv_id("https://arxiv.org/pdf/2401.12345") == "2401.12345"
    assert arxiv.extract_arxiv_id("arXiv:1605.08386") == "1605.08386"
    assert arxiv.extract_arxiv_id("no arxiv here") == ""


def test_crossref_extract_doi():
    assert crossref.extract_doi("https://doi.org/10.1038/s41586-021-03819-2") == "10.1038/s41586-021-03819-2"
    assert crossref.extract_doi("see 10.1145/3442188.3451607 for details") == "10.1145/3442188.3451607"
    assert crossref.extract_doi("no doi here") == ""


# ── 分发逻辑（无网络）──────────────────────────────────────────────────────

def test_skip_non_paper_type():
    ref = ExternalReference(id="r1", source_type="other", title="x", url="https://example.com")
    result = _verify_one(ref, ["arxiv", "crossref"])
    assert result.status == "skipped"


def test_pending_when_no_identifier():
    ref = ExternalReference(id="r1", source_type="paper", title="某论文", authors="张三")
    result = _verify_one(ref, ["arxiv", "crossref"])
    assert result.status == "pending"
    assert "需人工核验" in result.detail


def test_arxiv_routed_when_id_present():
    ref = ExternalReference(id="r1", source_type="paper", title="x", url="https://arxiv.org/abs/1706.03762")
    # mock arxiv.verify 避免真实网络
    with patch.object(arxiv, "verify", return_value=ReferenceVerification(status="verified", source="arxiv")):
        result = _verify_one(ref, ["arxiv", "crossref"])
    assert result.status == "verified"
    assert result.source == "arxiv"


def test_crossref_routed_when_doi_present():
    ref = ExternalReference(id="r1", source_type="paper", title="x", url="https://doi.org/10.1038/s41586-021-03819-2")
    with patch.object(crossref, "verify", return_value=ReferenceVerification(status="verified", source="crossref")):
        result = _verify_one(ref, ["arxiv", "crossref"])
    assert result.status == "verified"
    assert result.source == "crossref"


def test_source_filter_respects_enabled_list():
    """回归：sources 未启用 arxiv 时，即使 title 含 arXiv id 也不应走 arxiv。
    这是 and/or 优先级 bug 的回归保护（原 bug：A and B or C 绕过了 enabled 检查）。
    """
    ref = ExternalReference(
        id="r1", source_type="paper",
        title="Attention Is All You Need arXiv:1706.03762",
        url="https://arxiv.org/abs/1706.03762",
    )
    arxiv_called = {"yes": False}

    def _track_arxiv(*args, **kwargs):
        arxiv_called["yes"] = True
        return ReferenceVerification(status="verified", source="arxiv")

    with patch.object(arxiv, "verify", side_effect=_track_arxiv), \
         patch.object(crossref, "verify", return_value=ReferenceVerification(status="skipped", source="crossref")):
        # 只启用 crossref：不应调用 arxiv.verify
        result = _verify_one(ref, ["crossref"])
    assert arxiv_called["yes"] is False, "sources 未含 arxiv 时不应调用 arxiv.verify"
    assert result.source != "arxiv"

    # 反向：启用 arxiv 时应调用
    arxiv_called["yes"] = False
    with patch.object(arxiv, "verify", side_effect=_track_arxiv):
        _verify_one(ref, ["arxiv"])
    assert arxiv_called["yes"] is True, "sources 含 arxiv 且有 id 时应调用 arxiv.verify"


# ── 离线降级 ─────────────────────────────────────────────────────────────────

def test_arxiv_network_failure_degrades_to_pending():
    """arXiv 请求失败时降级为 pending，不抛错。"""
    ref = ExternalReference(id="r1", source_type="paper", title="Test", url="https://arxiv.org/abs/1706.03762")
    with patch.object(arxiv, "text_get_with_retry", side_effect=RuntimeError("连接超时")):
        result = arxiv.verify("Test", "https://arxiv.org/abs/1706.03762")
    assert result.status == "pending"
    assert "arXiv 请求失败" in result.detail


def test_crossref_404_is_not_found():
    """Crossref 404 是确定性结果，应为 not_found 而非 pending。"""
    ref = ExternalReference(id="r1", source_type="paper", title="Fake", url="https://doi.org/10.9999/fake")
    with patch.object(crossref, "json_get_with_retry", side_effect=RuntimeError("HTTP 404: not found")):
        result = crossref.verify("Fake", "https://doi.org/10.9999/fake")
    assert result.status == "not_found"


# ── schema 兼容性 ───────────────────────────────────────────────────────────

def test_external_reference_verification_defaults_none():
    """旧记录无 verification 字段时，model_validate 容错为 None。"""
    ref = ExternalReference.model_validate({"id": "r1", "title": "x"})
    assert ref.verification is None


def test_external_reference_with_verification():
    ref = ExternalReference.model_validate({
        "id": "r1", "title": "x",
        "verification": {"status": "verified", "source": "arxiv"},
    })
    assert ref.verification == {"status": "verified", "source": "arxiv"}
