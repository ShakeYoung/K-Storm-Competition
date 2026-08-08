"""stdlib urllib GET 客户端，复用 compatible.py 的重试/TLS 风格但面向公开学术 API。

与 model_providers/compatible.py 的差异：
- 只做 GET（学术 API 都是 GET）
- 默认严格 TLS（公开 CA，无需 allow_insecure）
- transient 判定：429 + Retry-After、5xx、连接重置/超时
- 不依赖 model 错误关键字
"""
from __future__ import annotations

import json
import socket
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

MAX_RETRIES = 3
_RETRY_DELAYS = [1.0, 3.0, 6.0]  # 比模型调用更克制，避免给公开 API 施压


def json_get_with_retry(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
    max_retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    """GET 请求返回 JSON dict。transient 错误指数退避重试；其他错误抛 RuntimeError。"""
    return _get(url, headers=headers, timeout=timeout, max_retries=max_retries, want_json=True)


def text_get_with_retry(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
    max_retries: int = MAX_RETRIES,
) -> str:
    """GET 请求返回原始文本（用于 arXiv Atom XML）。"""
    return _get(url, headers=headers, timeout=timeout, max_retries=max_retries, want_json=False)


def _get(
    url: str,
    *,
    headers: dict[str, str] | None,
    timeout: int,
    max_retries: int,
    want_json: bool,
):
    req_headers = {"User-Agent": "K-Storm-reference-verifier/1.0 (local research tool)"}
    if headers:
        req_headers.update(headers)
    last_error = ""
    for attempt in range(max_retries + 1):
        request = urllib.request.Request(url, headers=req_headers, method="GET")
        try:
            ctx = ssl.create_default_context()  # 严格 TLS
            with urllib.request.urlopen(request, timeout=timeout, context=ctx) as response:
                raw = response.read().decode("utf-8", errors="replace")
                if want_json:
                    return json.loads(raw)
                return raw
        except urllib.error.HTTPError as exc:
            code = exc.code
            detail = exc.read().decode("utf-8", errors="replace")[:200]
            last_error = f"HTTP {code}: {detail}"
            if code in {429, 500, 502, 503, 504} and attempt < max_retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                delay = float(retry_after) if (retry_after and retry_after.isdigit()) else _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
                time.sleep(delay)
                continue
            # 404 是确定性结果，不重试，交给调用方判定
            raise RuntimeError(last_error)
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            last_error = f"连接错误: {exc.reason if hasattr(exc, 'reason') else exc}"
            if attempt < max_retries:
                time.sleep(_RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)])
                continue
            raise RuntimeError(last_error)
    raise RuntimeError(last_error or "未知请求错误")
