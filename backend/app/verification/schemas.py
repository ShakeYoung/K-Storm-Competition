"""引用在线核验的 Pydantic schema 与纯函数分发器。

设计原则（仿 memory/ 的纯函数范式）：
- verify.py 只做策略分发，不含 IO
- sources/*.py 每个一个纯函数 verify(ref) -> ReferenceVerification，IO 隔离在 http_client
- 离线/超时/人机校验一律降级为 status=pending，永不抛错
"""
from __future__ import annotations

from pydantic import BaseModel


class ReferenceVerification(BaseModel):
    """单条引用的在线核验结果。挂在 ExternalReference.verification 上。"""
    status: str = "pending"  # verified | mismatch | not_found | pending | skipped
    source: str = ""         # arxiv | crossref | openreview | none
    matched_title: str = ""
    matched_authors: str = ""
    matched_year: str = ""
    detail: str = ""
    verified_at: str = ""
