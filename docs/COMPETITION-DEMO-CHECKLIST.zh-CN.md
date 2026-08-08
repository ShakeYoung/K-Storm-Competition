# K-Storm 参赛演示 Checklist

> 目标：现场 3-5 分钟内完整展示价值链，不依赖现场网络与平台稳定性。

## 演示前准备（提前一天）

- [ ] **后端可启动**：`cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000`，`/api/health` 返回 `{"status":"ok"}`
- [ ] **前端可构建**：`cd frontend && npm run build` 成功；`npm run preview -- --port 4173` 可访问
- [ ] **演示 run 就绪**：首次启动后端会自动 seed 演示案例（`demo_llm_security`）；总览页历史列表可见 `[演示] LLM 安全 · harness attack 机制诊断`
- [ ] **模型 Key 已配置**（若要演示真实模型）：模型设置 → 中国科大 107 平台 → ⚡一键配置 → 填写 API Key。**未填 Key 时可用本地 Mock 演示流程，但引用会是示例数据**
- [ ] **数据备份**：`data/ks.sqlite3` 已备份；如换机器，可从备份恢复或重新 seed

## 现场演示路径（推荐 3 分钟版）

1. **总览页**（30 秒）：展示历史 run 数量、已完成/失败统计、输出物状态条
2. **一键演示案例**（90 秒，**断网可用**）：
   - 新建讨论页 → 点击「⚡ 一键演示：LLM 安全诊断（完整 run）」
   - 进入讨论台：展示 3 轮 Agent 讨论（Novelty/Mechanism/Feasibility/Reviewer + Moderator）
   - 切到 Critique / Citation Review 区块：展示六维批判与引用审查
   - 切到报告页：展示最终 Markdown 报告（可直接用于组会）
   - 切到外部论据页：展示 28 条引用分组
3. **真实模型演示**（60 秒，**需网络+Key**，可选）：
   - 配置好 107 平台 Key 后，用「参赛演示模式」填入一个案例模板
   - 启动快速探测或聚焦讨论，展示流式逐字输出

## 兜底路径（30 秒，现场翻车时）

- 若网络/平台异常：直接打开预置演示 run（上述第 2 步），全程零模型调用
- 若后端启动失败：用 `/api/history/location` 定位 SQLite，直接用 DB 工具展示数据
- 若前端白屏：`npm run build` 重新构建；或直接展示 `docs/` 下的架构图与路演材料

## 答辩高频问题预案

| 问题 | 答案要点 |
|:--|:--|
| 这些引用是真的吗？ | 外部论据页可点「在线核验」（arXiv/Crossref），未核验的标注「待人工核实」；系统不编造，Citation Review Agent 明确声明边界 |
| 多 Agent 比单次问 LLM 好在哪？ | 角色分工 + Moderator 冲突汇总 + Critique 独立审查 + 结构化 IR 绑定证据，产出可复盘而非一段话 |
| 现场能跑吗？ | 预置演示 run 断网可用；真实模型走 107 平台，有重试与降级 |
| 数据存哪？安全吗？ | 本地 SQLite（WAL），API Key 仅浏览器 localStorage，不写磁盘不上云 |
