<div align="center">

<img src="assets/k-storm-icon.svg" width="180" alt="K-Storm logo">

# K-Storm

**Local multi-agent research topic brainstorming**

Research template + uploaded documents → structured briefing → controlled multi-agent discussion → Markdown topic-selection report.

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/ShakeYoung/K-Storm/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/version-v2.0-blue.svg?style=flat-square)](https://github.com/ShakeYoung/K-Storm)
[![Python](https://img.shields.io/badge/python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[English](./README.md) | [中文文档](./README.zh-CN.md)

</div>

---

## ⚡ Overview

K-Storm is a **fully local** research topic brainstorming workbench. Multiple AI agents (Novelty, Mechanism, Feasibility, Reviewer) hold a structured multi-round discussion on your research question, then produce a ready-to-use Markdown report for thesis proposals or group meetings.

**Zero cloud dependency** — works out of the box with the built-in mock provider. Plug in any OpenAI-compatible or Anthropic API to unlock real agent reasoning.

## 🪄 Discussion Modes

| Mode | Agents | Rounds | Best For |
|:--|:--|:--|:--|
| **Full Deliberation** | 4 + Moderator | 1–5 | Comprehensive brainstorming → full IR + report |
| **Focused Panel** | Select 2–3 | 1–2 | Targeted deep-dive on specific questions |
| **Quick Probe** | 1 | 1 | Fast sanity check on one question |
| **Memory Query** | Select agents | 1–5 | Continue from a historical run's context |

## 🧭 Research Stages

K-Storm automatically detects which phase of the research cycle you're in based on the information density in your template, and adjusts all agent output focus accordingly. You can also override the detection manually.

| Stage | When | What Changes |
|:--|:--|:--|
| **Topic Exploration** | Sparse input, no clear topic yet | Agents propose candidate topics and direction suggestions |
| **Plan Refinement** | Well-defined topic + experiment design | Agents focus on pushing your current plan forward |
| **Result Diagnosis** | Input contains experimental data or results | Agents interpret results, locate bottlenecks, design follow-up experiments |
| **Pivot Evaluation** | Input signals frustration, dead ends, or need to change direction | Agents evaluate whether to adjust or pivot |

<details>
<summary><b>How stage detection works</b></summary>

The inference engine examines your template fields for:

1. **Result signals** — numerical data, fold-changes, sample sizes, p-values → `Result Diagnosis`
2. **Design maturity** — controls, replicates, specific assays, animal models → `Result Diagnosis` if dense enough
3. **Pivot signals** — "stuck", "bottleneck", "failed", "pivot", "switch direction" → `Pivot Evaluation`
4. **Plan maturity** — rich platform/constraints/target output + detailed existing basis (> 80 chars) → `Plan Refinement`
5. **Default** — everything else → `Topic Exploration`

The detected stage is injected into every agent prompt as a **stage label + stage goal**, and shapes the final report structure.

</details>

## ✨ Core Capabilities

- 📋 **Structured template input** — research field, background, existing basis, constraints, goals
- 📎 **Document upload** with type tagging (design / experiment-data) and per-document notes
- 🧩 **Hybrid large-document intake** — small uploads go through full-text intake; large uploads trigger per-document summary extraction + budgeted intake synthesis, with a user-visible warning if any documents are dropped due to budget overflow
- 🤖 **4 discussion agents** — Novelty · Mechanism · Feasibility · Reviewer
- 🎯 **Moderator** — summarizes conflicts, omissions, and next-round questions
- 📊 **Structured IR** — candidate directions (novelty / feasibility / risk / priority / evidence refs / critique refs / next actions), evidence chain, critique points
- 📝 **Final Markdown report** — thesis-ready, with per-section copy buttons
- 📚 **External references** — agents cite papers/blogs/datasets; two-tier extraction; dedicated references page with grouped display and export
- 🔄 **Run management** — stop, resume from failure, rerun from scratch
- 🗂️ **History** — search, filter by status, open past runs, delete
- 📤 **Export** — MD / PDF (print dialog), ZIP bundle (report + debate + metadata), Run JSON
- ✅ **Validated generation** — end markers + structural checks prevent half-finished messages from advancing; auto-retry with context-preserving continuation prompt
- ⚙️ **Per-agent model assignment** — mix mock / OpenAI-compatible / Anthropic per agent slot
- 🏷️ **Discussion naming** — name each run for easy identification in history
- ⚡ **USTC-107 preset** — one-click model assignment for the USTC 107 platform (10 models: deepseek-v4-pro · deepseek-v4-flash · glm-5.2 · qwen3.6-chat · qwen3.6-reasoner · qwen-chat · qwen-reasoner · smart/default · smart/reasoning · deepseek-v4-flash-ascend)
- 📝 **Markdown briefing rendering** — agent briefing blocks render inline Markdown
- 🔒 **Thread-safe retry** — concurrent retry callbacks are lock-protected to prevent DB write conflicts
- 🌊 **SSE token streaming** — dual-channel SSE: run-state channel (800ms snapshot) + token-stream channel (100ms buffer); phantom card transitions seamlessly to confirmed message
- 🔍 **Critique Agent** — independent structured critique phase after all debate rounds; covers 6 risk dimensions (novelty / evidence chain / feasibility / consistency / bias / next-step risk)
- 📚 **Citation Review Agent** — cross-validates all cited references for relevance, completeness, consistency and density; produces A/B/C/D citation quality rating
- 🧠 **TF-IDF cross-run memory search** — extracts 5-type MemoryEntries (directions / decisions / claims / critiques / opportunities) from all completed runs' StructuredIRV2; pure stdlib bigram TF-IDF cosine retrieval with type and field filters; accessible via the "跨 Run 知识检索" tab in Memory Query mode

## 🏗️ Architecture

K-Storm is organized as a local research orchestration system: the React console handles input, debate visualization, reports, and history; the FastAPI backend runs the state machine and routes each agent slot to its assigned model. Nine specialized agents collaborate across the pipeline:

**Debate group** (each independently bound to a model)
- **Novelty Agent** — proposes new directions and differentiating angles
- **Mechanism Agent** — examines causal chains and mechanism plausibility
- **Feasibility Agent** — evaluates experiment design, resources, and execution cost
- **Reviewer Agent** — simulates peer-review criticism and exposes weak points

**Orchestration & synthesis**
- **Intake Agent** — condenses template + uploaded documents into a structured briefing
- **Moderator** — after round 1, summarizes conflicts, omissions, and the agenda for round 2+
- **Critique Agent** — after all debate rounds, produces an independent 6-dimension risk report
- **Group Summarizer** — compresses per-agent IR summaries into a structured StructuredIRV2 decision record
- **Citation Review Agent** — cross-validates all cited references for credibility; outputs A/B/C/D rating
- **Output Agent** — synthesizes briefing + IR + debate into the final Markdown report

<div align="center">
<img src="assets/k-storm-architecture.svg" alt="K-Storm Architecture" width="1400">
</div>

<details>
<summary><b>Workflow Pipeline</b></summary>

```text
Template + uploaded documents
  ↓
(large uploads only) per-document summary extraction + budget control
  ↓
Intake Agent → dense briefing
  ↓
Round 1 (optional parallel)
  ↓
Moderator → conflict/omission summary + next-round question list
  ↓
Round 2+ (serial)
  ↓
Critique Agent → 6-dimension risk assessment report
  ↓
Per-agent IR summary snippets
  ↓
Structured IR (candidate directions + evidence refs + critique points)
  ↓
Citation Review Agent → reference credibility audit
  ↓
Output Agent → final Markdown report
```

</details>

<details>
<summary><b>Project Structure</b></summary>

```text
backend/
  app/
    agents/              Agent definitions and registry
    model_providers/     Mock, OpenAI-compatible, Anthropic providers
    orchestrator/        Run execution state machine
    schemas/             Pydantic models
    storage/             SQLite database layer
    memory/              TF-IDF cross-run memory retrieval engine
    main.py              FastAPI app entry point
frontend/
  public/
    favicon.svg          App icon (browser favicon)
  src/
    main.jsx             React application
    styles/
      app.css            Stylesheet — light USTC blue theme
assets/
  k-storm-icon.svg       Project icon (1024×1024, for app packaging)
  k-storm-architecture.svg
docs/
  ARCHITECTURE.zh-CN.md       Architecture documentation
  K-STORM-ROADMAP.zh-CN.md    Evolution roadmap
```

</details>

## 🚀 Quick Start

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ (for the Vite frontend)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Default uses **mock provider** — no API key needed.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### 3. Configure Models (optional)

Open **Model Settings** in the top bar. Supported provider types:

| Provider Type | Examples |
|:--|:--|
| OpenAI Compatible | DeepSeek, DashScope, OpenRouter, Ollama, SiliconFlow, MiniMax |
| OpenAI Responses | OpenAI |
| Anthropic Messages | Claude |
| Coding Plan | Kimi, 百炼, 火山引擎 |
| USTC-107 preset | GLM5.2 / DeepSeek-V4 (one-click) |

API keys stay in your browser's `localStorage` — never written to disk or SQLite.

<details>
<summary><b>Common Base URLs</b></summary>

| Provider | Base URL |
|:--|:--|
| Kimi Coding | `https://api.kimi.com/coding/v1` |
| 百炼 Coding | `https://coding.dashscope.aliyuncs.com/v1` |
| 火山引擎 Coding | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama | `http://127.0.0.1:11434/v1` |
| MiniMax | `https://api.minimax.io/v1` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |

</details>

## 🔧 Tech Stack

| Layer | Technology |
|:--|:--|
| Frontend | React 19 + Vite |
| Backend | FastAPI |
| Storage | SQLite (WAL) |
| Agent orchestration | Custom state machine |
| Model providers | Mock · OpenAI-compatible · Anthropic |

## 📡 API Reference

```text
POST   /api/runs                          Create a new run
GET    /api/runs/{run_id}                 Get run status and full data
GET    /api/runs/{run_id}/stream          SSE stream — push on status/message change (800ms)
GET    /api/runs/{run_id}/token-stream   SSE token stream — live token buffer flush (100ms)
GET    /api/runs/{run_id}/messages        Get debate messages
GET    /api/runs/{run_id}/report          Get final Markdown report
POST   /api/runs/{run_id}/rerun           Rerun from scratch
POST   /api/runs/{run_id}/resume          Resume a failed/canceled run
POST   /api/runs/{run_id}/cancel          Cancel a running run
POST   /api/runs/{run_id}/references      Extract or update external references
POST   /api/memory/query                  Memory query against a completed run
POST   /api/memory/search                 TF-IDF cross-run knowledge search
GET    /api/history                       List past runs
POST   /api/history/delete                Delete selected runs
POST   /api/models/discover               Discover available models from a provider
POST   /api/documents/extract             Extract text from uploaded PDF/DOCX/TXT
```

## 📜 License

[MIT](LICENSE) © 2026 apech
