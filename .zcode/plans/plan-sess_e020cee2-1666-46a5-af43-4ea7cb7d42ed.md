# K-Storm 参赛完善计划（全阶段，依次执行）

> 三个澄清问题（OpenReview 接入方式 / 人工介入形态 / 演示案例来源）未获答复，按推荐选项执行；如有调整在对应阶段标注。

---

## 阶段 0：演示保障（断网可演）

### 0.1 演示案例包 + 一键打开
- **后端 seed 机制**：从现有库挑 1-2 条 final_report 优质的 COMPLETED run（当前代码跑 `resume_run` 时的 critique/citation 补跑路径可补全缺失产物）；导出为 `backend/app/seed/demo_{id}.json`。
- `main.py` startup（`init_db()` 之后）检测 `demo_*` run_id 不存在 → `create_run` 建壳 → `update_run` 灌入全部产物 + timeline 全 completed + status=COMPLETED。
- **前端**：`COMPETITION_DEMOS`（`constants.js`）每项加 `runId`；`TemplatePanel.jsx` 按钮优先 `onOpenRun(demo.runId)`（复用现有 openRun 路径，`main.jsx:425`），无 runId 回退到 `applyTemplatePreset`。
- **验收**：全新空库启动后总览页可见演示案例卡片，点击直接进入完整讨论链 + IR + 报告 + 引用页，全程零 LLM 调用。

### 0.2 mock 引用真实性
- `mock.py:73` 等处的 `example.com` 假链接替换为真实公开资源（TCGA、arXiv 经典论文链接），或统一标注「[示例引用 · 待核验]」。
- **验收**：`grep -r example.com backend/app/model_providers/mock.py` 无命中。

### 0.3 演示 checklist
- 新增 `docs/COMPETITION-DEMO-CHECKLIST.zh-CN.md`：Key 就绪 / 案例就绪 / 网络检查 / 30 秒兜底路径。

---

## 阶段 1：科研深度

### 1.1 引用在线核验（arXiv + Crossref + OpenReview 尽力降级）★最高价值

**新增模块 `backend/app/verification/`**（仿 `memory/` 纯函数范式）：
- `schemas.py`：`ReferenceVerification(BaseModel)` —— `status`(verified/mismatch/not_found/pending), `source`(arxiv/crossref/openreview), `matched_title`, `matched_authors`, `matched_year`, `detail`, `verified_at`。
- `http_client.py`：`json_get_with_retry(url, headers, *, timeout=20, max_retries=3)` —— stdlib urllib GET 版，复用 `compatible.py` 的 `_retry_delay`/`_ssl_context` 语义但独立 transient 判定（429+Retry-After、5xx、连接重置）；**默认严格 TLS**。
- `sources/arxiv.py`：解析 URL/正则里的 arXiv id（复用 runner.py 现有 arxiv 正则），GET `https://export.arxiv.org/api/query?id_list=<id>`（Atom XML，stdlib `xml.etree`），返回 title/authors/published。限速：单次请求，间隔 ≥3s（arXiv 要求）。
- `sources/crossref.py`：从 URL 提取 DOI（`doi.org/` / `10.\d{4,9}/` 正则），GET `https://api.crossref.org/works/<doi>`，取 `message.title/author/published/DOI/container-title`。Crossref 公共访问推荐加 `mailto` 到 User-Agent（polite pool）。
- `sources/openreview.py`（**尽力+降级**，按用户未答时的推荐）：GET `https://api2.openreview.net/notes?content.title=<title>&limit=3`；遇 302 跳转 challenge / 401 / 超时 → 返回 `status=pending, detail="OpenReview 需人工核验（触发人机校验）"`，不抛错。成功才比对 title/authors。
- `verify.py`：`verify_references(refs: list[ExternalReference]) -> list[ReferenceVerification]` 纯函数分发（按 ref.source_type/url/title 路由到对应源；无 URL/DOI 的 paper 标 pending；非 paper/blog/dataset 默认 skip）。

**Schema 扩展**（无需 ALTER TABLE，`external_references` 已是 JSON 列表）：
- `ExternalReference` 新增 `verification: ReferenceVerification | None = None`（`schemas/models.py:100-109`）。旧记录该字段缺省为 null，`model_validate` 容错。

**后端端点**：
- 新增 `POST /api/runs/{run_id}/references/verify`（`main.py:420` 的 `/references` 之后）：拉 `external_references` → `verify_references` → 写回 `verification` 字段（复用 merge 路径避免清空已提取引用）。支持 `?sources=arxiv,crossref` 过滤。
- **离线降级**：所有源失败/超时 → 该 ref 标 `pending`；核验步骤永不抛 500。

**Citation Review prompt 增强**：
- `registry.py` 的 `CITATION_REVIEW_AGENT` system prompt 去掉"不能访问外部数据库"的硬限制文案，改为"已核验的引用标注真实存在性，未核验的仍标注需人工核实"；`citation_review_prompt`（`prompts.py`）注入已核验状态供 LLM 参考。

**前端**（`ReferencesPage.jsx`）：
- ref 卡片（第 188 行 `<div>`）标题后加核验徽章：verified=绿✓、mismatch=红⚠、not_found=灰?、pending=黄⏳；鼠标悬停显示 `detail`。
- 工具栏（第 142 行）新增「在线核验」按钮，调 verify 端点，带 loading 态。
- **验收**：对真实 arXiv/Crossref 引用可标注 verified；对编造引用可标 not_found；离线时全部 pending 且不报错。

### 1.2 人工介入（轮次边界追加 + 下轮自动携带，推荐形态）
- **Schema**：`DebateMessage`（`models.py:71`）新增 `is_human: bool = False`；`has_agent_message`（`runner.py:1824`）加防御 `if message.is_human: continue`。
- **端点**：`POST /api/runs/{run_id}/interject`（`main.py:418` resume 之后）—— 纯 DB 追加：`list(run.debate_messages) + [DebateMessage(round=N, agent="你", is_human=True, ...)]` 整体覆盖写（防竞态）。
- **runner 改动（1 行/路径）**：`run_debate_round_serial`（`runner.py:1598`）/`execute_focused_panel` 循环顶部（`runner.py:573`）加 `messages = list(db.get_run(run.run_id).debate_messages)` 重拉 DB，让运行中 run 的下一轮看到人工意见。已完成 run 的 interject 仅追加历史，引导用户走"基于意见重跑"（沿用现有 resume 路径）。
- **前端**：DebateView 每轮卡片网格底部加 textarea + 提交按钮；人工意见用 `human-card` 样式（accent-soft 底色）插入 message-grid 末尾；提交后 SSE `/stream` 自动刷新。
- **验收**：第 1 轮后插入意见，第 2 轮 agent 输出可见对该意见的回应。

### 1.3 记忆检索语义增强（LLM 查询扩展）
- `/api/memory/search` 增加可选 `expand_query`（默认开）：调用入口模型把原问题扩成 3-5 个同义检索词，合并 TF-IDF 结果去重；离线/失败降级为原 TF-IDF。
- **验收**：同义表述（蛋白折叠↔蛋白质结构预测）可命中。

### 1.4 大文档信息保全
- `summarize_documents_if_needed` 后追加：intake prompt 要求输出"因预算省略的关键点清单" → 存入 `structured_brief` 新字段 `omitted_notes` → 前端 brief 区显示可操作提示。
- **验收**：丢弃警告升级为具体清单。

---

## 阶段 2：口径与叙事

### 2.1 Agent 口径统一
- `ModeSelector.jsx` modes 数组的 `agents: 8` → 统一为"10 Agent"或"4 讨论 + 6 编排"。
- 全站搜索无"8 Agent"/"9 个 Agent"残留。

### 2.2 对比叙事
- README/docs 新增「K-Storm vs 直接问 LLM」对比表 + 1 个案例的产出对比（用 0.1 的演示 run 截图）。

### 2.3 量化指标
- 后端 run 统计耗时（timeline 首尾差）+ 调用次数（debate_messages + critique + citation + intake + output）；前端报告页/历史列表展示。
- README 汇总"完整讨论约 X 分钟 / Y 次调用"。

---

## 阶段 3：工程与材料

### 3.1 前端测试起步
- vitest + `src/lib/` 纯函数单测（markdown/zip/constants 前端逻辑）；不追求组件测试。

### 3.2 历史备份
- 新增「全部历史导出（JSON）」+「导入恢复」；README 说明数据位置。

### 3.3 设计文档同步
- 更新 `K-Storm-设计文档.docx` 或补 `docs/COMPETITION-INTRO.zh-CN.md`（评委 5 分钟版）：升级链路/记忆检索/一键配置/引用核验/人工介入 + 10 Agent 口径。

### 3.4 安全收口
- README 注明"仅本机使用"；`/api/models/discover` 对非 http(s) scheme 拒绝（防 SSRF，影响 1.1 的核验客户端也应遵循）。

---

## 验证
- 每阶段：`backend: pytest`（新增引用核验/人工介入/resume 携带意见单测）+ `frontend: npm run build`。
- 1.1 完成后：启动后端，用真实 arXiv id（如 1605.08386）+ Crossref DOI（10.1038/s41586-021-03819-2）+ 编造标题三组对照，curl 验证三态。
- 0.1 完成后：清空临时库，启动后端确认 seed 注入，浏览器打开演示案例卡片。
- 1.2 完成后：浏览器跑一轮 mock，第 1 轮后插入意见，确认第 2 轮 agent 回应。

## 执行顺序与里程碑
1. **第 1 批（演示零风险）**：0.2 mock 假链接 → 0.1 演示案例包 → 0.3 checklist
2. **第 2 批（最高价值）**：1.1 引用核验（含测试）
3. **第 3 批（演示亮点）**：1.2 人工介入（含测试）
4. **第 4 批（轻量增强）**：1.3 记忆扩展 + 1.4 文档保全
5. **第 5 批（口径叙事）**：2.1 + 2.2 + 2.3
6. **第 6 批（工程材料）**：3.1-3.4
7. 最终全量验证：pytest + build + 浏览器端到端冒烟

每批完成后汇报，可随时叫停或调整优先级。