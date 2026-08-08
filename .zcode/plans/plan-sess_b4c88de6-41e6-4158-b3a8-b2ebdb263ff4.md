# K-Storm 三阶段重构方案

核心原则：**先删封装、只做前后端调试，待核心稳定再封装。** 三阶段按"止血 → 稳定化 → 结构重整"推进，每阶段可独立交付、独立验证。

---

## 阶段 A：删除早期封装层 + 闭环止血

### A-0. 删除所有打包/封装产物（先做，清出干净工作区）

**删除文件/目录：**
- `electron/`（main.js，dev 不依赖；前端 backend 零引用，已核实）
- `build.sh`、根 `build/`、`release/`（284MB，electron-builder 产物）
- `backend/build/`（77MB PyInstaller 中间产物）、`backend/dist/`（52MB 冻结二进制）
- `backend/k_storm.spec`（PyInstaller 配置，可复现）
- `backend/server_entry.py`（PyInstaller 入口，dev 用 `app.main:app`）
- `backend/app/static/`（构建产物副本，git 跟踪 → `git rm`；main.py 已容错缺失，dev 由 Vite 提供 UI）
- `frontend/dist/`（Vite 构建产物）
- `k-storm-icon.iconset/`、`finesse_kstorm_preview_v3_light.html`、`finesse_kstorm_preview_v35_light_geek_console.html`（孤立设计稿）
- 所有 `.DS_Store`（7 处）

**编辑（不删除）根 `package.json`：** 只保留 `name/version/description/private`，删除 `main`、electron scripts、`build` 配置块、`devDependencies`（electron/electron-builder）。
→ 删除根 `node_modules/`（268MB）和 `package-lock.json`（electron 依赖，dev 不需要；前端有独立的 `frontend/node_modules`）。
→ 保留 `assets/k-storm-icon.{icns,ico,png,svg}` 和 `architecture.svg`（小、再封装用得到）。

> 注：`backend/app/main.py:resolve_app_version()` 读 `package.json` 的 version，删 package.json 会破坏 `/api/health`，所以是**编辑而非删除**。

### A-1. 修复升级链路（P0，5 处协同编辑）

`upgrade_from_run_id` 的 Pydantic 字段已存在于 `RunCreate`(models.py:179) 和 `RunRecord`(models.py:211)，main.py:349 生产端也已正确——只是没有落库。改 `db.py` + `runner.py`：

1. **`db.py` init_db（~行102-103 后镜像）：** 加 `if "upgrade_from_run_id" not in columns: db.execute("ALTER TABLE runs ADD COLUMN upgrade_from_run_id TEXT NOT NULL DEFAULT ''")`
2. **`db.py` create_run 签名（行128）：** 加形参 `upgrade_from_run_id: str = "",`（紧跟 source_run_id）
3. **`db.py` INSERT（行141-166）：** 列名加 `upgrade_from_run_id`、占位符 17→**18 个**、tuple 加值（否则 SQLite 绑定数不匹配报错）
4. **`db.py` row_to_run（行305 后镜像）：** 加 `upgrade_from_run_id=row["upgrade_from_run_id"] if "upgrade_from_run_id" in row.keys() else "",`
5. **`runner.py` create_run_record（行443/444）：** 调用 `db.create_run(...)` 时加 `upgrade_from_run_id=payload.upgrade_from_run_id,`

修完后 `inject_upgrade_context`（runner.py:49-91，读 line 54/57）即可真正带入上一轮 brief/IR/Critique。

### A-2. 统一 USTC 107 预置（P0）

以**实际可用**的 `https://api.llm.ustc.edu.cn/v1` 为事实源：
- **后端 `main.py` KNOWN_MODEL_PRESETS（行55）：** 加 `"ustc-107"` 键，写入文档中的 10 个模型：`deepseek-v4-pro / glm-5.2 / deepseek-v4-flash / deepseek-v4-flash-ascend / qwen3.6-reasoner / qwen3.6-chat / qwen-reasoner / qwen-chat / smart/default / smart/reasoning`
- **前端 `main.jsx`（行215）：** `ustc-107` provider 的 `base_url` 已是 `api.llm.ustc.edu.cn`（正确），保持；确认其 model 列表通过"读取模型"走 preset 即可拿到
- **文档 `USTC-107-PLATFORM-GUIDE`（行21）：** 把 `https://107.ustc.edu.cn/v1` 改为 `https://api.llm.ustc.edu.cn/v1`
- README 中相关 base url 同步

### A-3. 补齐文档提取依赖（P1）

- `backend/.venv/bin/pip install -r requirements.txt`（补 pdfplumber、python-docx，当前实测 ModuleNotFoundError）
- `main.py` 的 `/api/documents/extract`：依赖缺失时返回明确 error 字段而非静默空文本（当前 except 已写 error，但前端把 error 当 summary 显示，体验差）

### A-4. Critique/Citation 模型槽位口径统一（P1）

`agentSlots`（main.jsx:178）只有 8 槽，但推荐配置给 critique/citation_review 赋值（main.jsx:3402-3404），用户看不到改不了。补 2 个可见槽：
- **`main.jsx` agentSlots：** 追加 `["critique","Critique Agent","独立批判"]` 和 `["citation_review","Citation Review","引用审查"]`
- 与后端 `agents/registry.py` 的 `CRITIQUE_AGENT`/`CITATION_REVIEW_AGENT` key 对齐（已核实存在）

---

## 阶段 B：演示稳定化

### B-1. 状态机口径对齐（P1）
- **HistoryView 筛选（main.jsx:4418）：** 后端真实状态含 INTAKE_RUNNING/CRITIQUE_RUNNING/CITATION_REVIEW_RUNNING 等，但前端筛选只有 COMPLETED/FAILED/RUNNING。把所有 `*_RUNNING` 归一映射为"运行中"显示。
- **openRun 恢复轮询（main.jsx:975/986）：** `runningStates` 列表补齐 CRITIQUE_RUNNING/CITATION_REVIEW_RUNNING/CRITIQUE_RUNNING，并处理 CANCELED，避免打开这些状态 run 时不恢复轮询。

### B-2. 五条 smoke test（pytest）
新建 `backend/tests/`，mock provider 跑 quick/focused/full/memory/upgrade 全链路，断言：
- 各模式关键产物字段非空（structured_brief / debate_messages / group_summary / final_report）
- upgrade run 的 `intake_synthesis` 含升级上下文片段（呼应 A-1，作为闭环回归保护）

### B-3. 能力边界诚实化（P2）
- Citation Review 本质是"LLM 引用文本语义自检"，未接外部数据库。UI/报告文案把"引用真实性审查 / 质量评级 A-D"改为"引用线索一致性检查"，避免评委追问验证手段时露怯。涉及 main.jsx 中 DebateView 的 Citation Review 标题、registry.py CITATION_REVIEW_AGENT system_prompt 表述。

### B-4. 顺手修小 bug
- `main.jsx:2438` `run.field`（恒 undefined）→ `run?.template_input?.field`
- `runner.py:1846` `template.constraints.replace(";",";")` 无效操作 → 真正按分号拆分约束项

---

## 阶段 C：结构重整（不阻塞演示，持续推进）

### C-1. 后端拆 `runner.py`（3311 行）
拆为 `orchestrator/{runner, prompts/, steps/, validators/, references/, streaming/}`，prompt 外部化为独立文件/常量模块，业务逻辑与提示词解耦。

### C-2. 前端拆 `main.jsx`（4561 行）
拆为 `main.jsx(入口+路由) + api/ + hooks/ + lib/ + state/ + components/{layout,pages,debate,settings,report}`。每拆一个组件跑一次 build，纯结构不改行为。

### C-3. CSS 收敛（2459 行）
删除 `app.css` 后追加的 `finesse-ui v3.5` 重复主题覆盖层，统一到一套 token + 组件层。

### C-4. 字体本地化
`index.html` 的 Google Fonts 外链改为 `@fontsource/inter` 本地化或 system-ui fallback，守住"本地优先/离线"定位。

### C-5. 其他工程债
`@app.on_event("startup")` → FastAPI lifespan；SQLite 引入 `PRAGMA user_version` 迁移机制收敛 init_db 的 ALTER 堆积。

---

## 验证方式
- 阶段 A：后端 `python -c` 语法检查 + 跑升级链路验证上下文注入；前端 `vite build` 通过；`pip install -r requirements.txt` 后 PDF/DOCX 提取可用
- 阶段 B：pytest 五条 smoke test 全绿
- 每个文件改动后即时 build / 语法校验，不积压风险

## 不在本次范围
- 真实引用核验（接 Crossref/OpenAlex）——未来能力，本次只改文案
- 多进程 run 状态恢复（进程内 buffer 改共享存储）——本地场景可接受现状
- API Key 加密落盘——维持 localStorage，文档标注风险

实施时**先做 A-0（删封装）**，再做 A-1～A-4（止血），每步可单独验证。