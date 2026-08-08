"""引用在线核验模块。

- schemas.py: ReferenceVerification
- http_client.py: urllib GET with retry
- sources/arxiv.py, crossref.py, openreview.py: 各源纯函数核验
- verify.py: 策略分发（按 ref.url/title 路由到对应源）
"""
