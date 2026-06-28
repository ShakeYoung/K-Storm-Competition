<div align="center">

<img src="assets/k-storm-icon.svg" width="180" alt="K-Storm logo">

# K-Storm

**本地多 Agent 科研选题头脑风暴**

科研模板 + 上传文档 → 结构化 briefing → 可控多轮 Agent 讨论 → Markdown 选题报告

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/ShakeYoung/K-Storm/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/version-v2.0-blue.svg?style=flat-square)](https://github.com/ShakeYoung/K-Storm)
[![Python](https://img.shields.io/badge/python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[中文文档](./README.zh-CN.md) | [English](./README.md)

</div>

---

## ⚡ 项目概述

K-Storm 是一个**完全本地运行**的科研选题多 Agent 头脑风暴工作台。多个 AI Agent（Novelty、Mechanism、Feasibility、Reviewer）围绕你的研究问题进行结构化多轮讨论，最终生成可直接用于开题报告或组会讨论的 Markdown 报告。

**零云端依赖** — 内置 mock provider 开箱即用；接入任意 OpenAI 兼容或 Anthropic API 即可解锁真实 Agent 推理。

## 🪄 讨论模式

| 模式 | Agent 数 | 轮次 | 适用场景 |
|:--|:--|:--|:--|
| **完整讨论** | 4 + Moderator | 1–5 | 全面头脑风暴，生成完整 IR 和报告 |
| **聚焦小节** | 自选 2–3 | 1–2 | 针对特定问题的深度讨论 |
| **快速探测** | 1 | 1 | 对单个问题做快速可行性判断 |
| **记忆查询** | 自选 | 1–5 | 基于历史讨论的上下文启动新讨论 |

<details>
<summary><b>记忆查询说明</b></summary>

选择一条已完成的历史讨论，读取其记忆上下文（已知事实、未知问题、约束条件、机会点），选择 Agent 和轮次，输入新问题后启动新讨论。新讨论会继承源 Run 的 briefing 和 IR 作为记忆注入，结果通过 `source_run_id` 与源 Run 关联。

</details>

## 🧭 科研阶段

K-Storm 根据模板信息密度自动判断当前所处的科研周期阶段，并调整所有 Agent 的输出侧重点和最终报告结构。你也可以手动覆盖自动判断结果。

| 阶段 | 触发条件 | 输出变化 |
|:--|:--|:--|
| **选题探索** | 信息较少，尚无明确课题 | Agent 提出候选课题和方向建议 |
| **方案收敛** | 已有明确课题 + 实验设计 | Agent 围绕当前课题推进和完善，不重新推荐新课题 |
| **结果诊断** | 输入中包含实验数据或结果 | Agent 解释结果、定位瓶颈、设计补充实验 |
| **转向评估** | 输入中包含卡住、偏差、失败等转向信号 | Agent 评估是否需要修正当前路线或转向备选方向 |

<details>
<summary><b>自动推断机制</b></summary>

推断引擎按以下优先级检查模板字段：

1. **结果信号** — 数值型数据（倍数、浓度、样本量、p 值等）→ `结果诊断`
2. **设计成熟度** — 对照、重复、流式、Western blot、动物模型等实验术语密度 ≥ 5 → `结果诊断`
3. **转向信号** — "转向""偏差""换题""不成立""失败""卡住""瓶颈""止损"等关键词 ≥ 2 → `转向评估`
4. **方案成熟度** — 平台/约束/目标产出等字段填充 ≥ 3 且已有基础 > 80 字 → `方案收敛`
5. **默认** → `选题探索`

检测到的阶段以**阶段标签 + 阶段目标**注入每个 Agent 的 prompt，并影响最终报告结构：
- 选题探索 → 报告主体为「推荐选题 Top 3-5」
- 其他阶段 → 报告主体围绕当前课题推进/诊断/修正，必要时在末尾附上转向建议

</details>

## ✨ 核心能力

- 📋 **结构化模板填写** — 研究方向、背景、已有基础、约束条件、研究目标
- 📎 **文档上传** — 支持 design / experiment-data 类型标注和逐文档注释
- 🧩 **大文档混合 intake** — 小规模上传走全文 intake；大规模上传自动切换为逐文档摘要提取 + 预算化整合，文档因预算超出被丢弃时向用户显示警告
- 🤖 **4 个讨论 Agent** — Novelty（创新性）· Mechanism（机制深挖）· Feasibility（可行性）· Reviewer（审稿质疑）
- 🎯 **Moderator** — 汇总冲突点、遗漏点，生成下一轮问题清单
- 📊 **结构化 IR** — 候选方向（创新性 / 可行性 / 风险 / 优先级 / 证据引用 / 批判引用 / 下一步行动）、证据链、批判点
- 📝 **最终 Markdown 报告** — 开题/组会可用，支持逐区域复制
- 📚 **外部论据** — Agent 引用论文/博客/数据集；二级提取 + 独立论据页面 + 分组导出
- 🔄 **运行管理** — 停止分析、从失败位置继续、从头重跑
- 🗂️ **历史记录** — 搜索、状态筛选、打开历史讨论、删除
- 📤 **多格式导出** — MD / PDF（打印对话框）、ZIP 打包（报告 + 讨论记录 + 元数据）、Run JSON
- ✅ **输出完整性校验** — 结束标记 + 结构化检查防止半截输出进入下一流程；截断时自动携带上下文续写重试
- ⚙️ **按 Agent 分配模型** — mock / OpenAI-compatible / Anthropic 混配
- 🏷️ **讨论命名** — 为每次 Run 命名，便于历史记录检索
- ⚡ **科大107平台预置** — 一键分配 USTC 107 平台 10 个模型（deepseek-v4-pro · deepseek-v4-flash · glm-5.2 · qwen3.6-chat · qwen3.6-reasoner · qwen-chat · qwen-reasoner · smart/default · smart/reasoning · deepseek-v4-flash-ascend）
- 📝 **Markdown briefing 渲染** — Agent briefing 区块内联渲染 Markdown 格式
- 🔒 **线程安全重试** — 并发重试回调加锁保护，防止 DB 写入冲突
- 🌊 **SSE 逐字流式输出** — 双通道 SSE：运行状态通道（800ms 快照）+ token 流通道（100ms 缓冲刷新）；phantom 卡片无缝过渡为确认消息
- 🔍 **Critique Agent** — 所有辩论轮次结束后独立执行批判审查，覆盖创新性风险 / 证据链完整性 / 可行性盲点 / 逻辑一致性 / 偏见盲区 / 下一步风险 六个维度
- 📚 **Citation Review Agent** — 对所有 Agent 引用的外部文献进行语义真实性交叉验证，输出引用质量 A/B/C/D 评级
- 🧠 **TF-IDF 跨 Run 记忆检索** — 从所有已完成 Run 的 StructuredIRV2 中提取 5 类 MemoryEntry（候选方向 / 决策摘要 / 关键主张 / 批判点 / 机会点），纯 Python stdlib 字符 bigram + 余弦相似度检索，支持类型与研究领域过滤；在记忆查询模式的「跨 Run 知识检索」Tab 中使用

## 🏗️ 系统架构

K-Storm 的核心是一个本地运行的研究编排系统：React 控制台负责输入、讨论可视化与报告呈现，FastAPI 后端维护运行状态机，并按 Agent 位置路由到不同模型。系统共有 9 个专职 Agent，协同完成从输入整合到最终报告的全流程：

**讨论组**（每个 Agent 可独立绑定不同模型）
- **Novelty Agent**：提出新方向与差异化切入点
- **Mechanism Agent**：检查机制链条与因果解释
- **Feasibility Agent**：评估实验资源、成本和可执行性
- **Reviewer Agent**：模拟审稿质疑，暴露风险与薄弱环节

**编排与综合层**
- **Intake Agent**：整合模板与上传文档，输出高密度结构化 Briefing
- **Moderator**：第 1 轮结束后汇总冲突点、遗漏点，生成第 2 轮讨论议程
- **Critique Agent**：所有辩论轮次结束后，独立产出六维风险评估报告
- **Group Summarizer**：将各 Agent IR 摘要压缩为 StructuredIRV2 决策结构体
- **Citation Review Agent**：对全部引用进行语义交叉校验，输出 A/B/C/D 引用质量评级
- **Output Agent**：综合 Briefing + IR + 讨论记录，生成最终 Markdown 报告

<div align="center">
<img src="assets/k-storm-architecture.svg" alt="K-Storm Architecture" width="1400">
</div>

完整架构文档见 [docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)。

<details>
<summary><b>运行流程</b></summary>

```text
模板 + 上传文档
  ↓
（大规模上传时）逐文档摘要提取 + 预算控制
  ↓
入口 Agent → 高密度 briefing
  ↓
第 1 轮（可选并行）
  ↓
Moderator → 冲突/遗漏汇总 + 下一轮问题清单
  ↓
第 2 轮起串行反驳/修正
  ↓
Critique Agent → 六维风险评估报告
  ↓
各 Agent → IR 要点摘要（压缩）
  ↓
结构化 IR → 候选方向 + 证据链 + 批判点
  ↓
Citation Review Agent → 引用真实性审查报告
  ↓
出口 Agent → 最终 Markdown 报告
```

</details>

<details>
<summary><b>项目结构</b></summary>

```text
backend/
  app/
    agents/              Agent 定义与注册
    model_providers/     Mock / OpenAI-compatible / Anthropic 供应商
    orchestrator/        运行执行状态机
    schemas/             Pydantic 模型
    storage/             SQLite 数据层
    main.py              FastAPI 入口
frontend/
  public/
    favicon.svg          应用图标（浏览器标签页图标）
  src/
    main.jsx             React 应用
    styles/
      app.css            样式表 — 浅色中科大蓝主题
assets/
  k-storm-icon.svg       项目图标（1024×1024，可用于桌面应用打包）
  k-storm-architecture.svg
docs/
  ARCHITECTURE.zh-CN.md       架构文档
  K-STORM-ROADMAP.zh-CN.md    演进路线图
```

</details>

## 🚀 快速启动

### 环境要求

- **Python** 3.10+
- **Node.js** 18+

### 1. 启动后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

默认使用 **mock provider**，无需任何 API Key。

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:5173>。

### 3. 配置模型（可选）

点击顶栏**模型设置**，支持以下供应商：

| 供应商类型 | 示例 |
|:--|:--|
| OpenAI Compatible | DeepSeek、DashScope、OpenRouter、Ollama、SiliconFlow、MiniMax |
| OpenAI Responses | OpenAI |
| Anthropic Messages | Claude |
| Coding Plan | Kimi、百炼、火山引擎 |
| 科大107平台预置 | GLM5.2 / DeepSeek-V4（一键分配） |

API Key 仅保存在浏览器 `localStorage` 中，不会写入磁盘或 SQLite。

<details>
<summary><b>常用 Base URL</b></summary>

| 供应商 | Base URL |
|:--|:--|
| Kimi Coding Plan | `https://api.kimi.com/coding/v1` |
| 百炼 Coding Plan | `https://coding.dashscope.aliyuncs.com/v1` |
| 火山引擎 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama | `http://127.0.0.1:11434/v1` |
| MiniMax | `https://api.minimax.io/v1` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |

</details>

## 🔧 技术栈

| 层级 | 技术 |
|:--|:--|
| 前端 | React 19 + Vite |
| 后端 | FastAPI |
| 数据库 | SQLite（WAL 模式） |
| Agent 编排 | 自研状态机 |
| 模型接入 | Mock（默认）· OpenAI Compatible · Anthropic |

## 📡 API 简表

```text
POST   /api/runs                          创建新运行
GET    /api/runs/{run_id}                 获取运行状态和完整数据
GET    /api/runs/{run_id}/stream          SSE 实时推送（状态/消息变化时推送，800ms）
GET    /api/runs/{run_id}/token-stream   SSE token 流（逐字缓冲刷新，100ms）
GET    /api/runs/{run_id}/messages        获取讨论消息列表
GET    /api/runs/{run_id}/report          获取最终 Markdown 报告
POST   /api/runs/{run_id}/rerun           从头重跑
POST   /api/runs/{run_id}/resume          从失败位置继续
POST   /api/runs/{run_id}/cancel          停止运行
POST   /api/runs/{run_id}/references      提取或更新外部论据
POST   /api/memory/query                  记忆查询（基于已完成 Run）
GET    /api/history                       历史记录列表
POST   /api/history/delete                删除历史记录
POST   /api/models/discover               从供应商发现可用模型
POST   /api/documents/extract             从 PDF/DOCX/TXT 提取文本
```

## 📜 许可证

[MIT](LICENSE) © 2026 apech
