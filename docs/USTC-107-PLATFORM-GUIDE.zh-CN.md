# 中国科大 107 算力平台适配说明

## 适配目标

K-Storm 面向“一〇七杯”智能体赛道时，推荐将中国科大 107 算力平台作为默认模型供应商，展示多模型、多 Agent 的科研支持工作流：

```text
用户科研材料
  -> Intake Agent 结构化 briefing
  -> Novelty / Mechanism / Feasibility / Reviewer 多 Agent 讨论
  -> Critique Agent 与 Citation Review Agent 独立审查
  -> Structured IR 与最终 Markdown 报告
```

## 模型配置

打开应用右上角“模型设置”，选择内置供应商：

```text
供应商：中国科大 107 算力平台
Base URL：https://107.ustc.edu.cn/v1
API 类型：OpenAI Compatible
API Key：填写 107 平台发放的个人或比赛密钥
```

当前预置模型包括：

- `deepseek-v4-pro`
- `glm-5.2`
- `deepseek-v4-flash`
- `deepseek-v4-flash-ascend`
- `qwen3.6-reasoner`
- `qwen3.6-chat`
- `qwen-reasoner`
- `qwen-chat`
- `smart/default`
- `smart/reasoning`

## 推荐 Agent 分配

参赛演示建议使用“高质量 + 快响应”的混合配置：

| Agent 位置 | 推荐模型 | 用途 |
|:--|:--|:--|
| Intake Agent | `glm-5.2` 或 `deepseek-v4-pro` | 消化模板、上传文档和用户约束 |
| Novelty Agent | `deepseek-v4-flash` 或 `qwen3.6-chat` | 生成差异化方向 |
| Mechanism Agent | `glm-5.2` 或 `qwen3.6-reasoner` | 梳理机制链条和因果解释 |
| Feasibility Agent | `deepseek-v4-flash` | 压实实验路线和成本 |
| Reviewer Agent | `glm-5.2` 或 `smart/reasoning` | 模拟导师/评审质疑 |
| Moderator | `glm-5.2` | 汇总冲突、遗漏和下一轮议程 |
| Group Summarizer | `deepseek-v4-pro` | 生成结构化 IR |
| Output Agent | `glm-5.2` 或 `deepseek-v4-pro` | 生成最终报告 |

若现场网络或额度不稳定，可将讨论 Agent 切到 `deepseek-v4-flash`，保留 Summarizer 和 Output 使用高质量模型。

## 调用方式

K-Storm 后端通过 OpenAI Compatible `/chat/completions` 风格接口调用 107 平台模型。模型密钥只保存在浏览器 `localStorage` 中，后端写入 SQLite 的运行记录会自动脱敏：

- 保存供应商名称、Base URL、模型列表和 Agent 分配；
- 不保存 API Key；
- 历史 Run 可复盘模型分配，但不能恢复密钥。

运行过程支持两路 SSE：

- `/api/runs/{run_id}/stream`：推送运行状态、时间线和已完成消息；
- `/api/runs/{run_id}/token-stream`：推送当前 Agent 的逐字输出。

## 参赛演示流程

推荐演示 3 个步骤：

1. 在“新建讨论”页点击“参赛演示模式”中的一个案例，一键填入高质量模板。
2. 打开“模型设置”，展示 107 平台供应商、模型列表和 Agent 分配。
3. 启动讨论，展示逐字流式输出、候选方向排序、Critique 审查和最终报告导出。

## 运行截图清单

提交材料建议包含以下截图：

1. 107 平台模型设置页：显示 Base URL、模型列表和 Agent 分配。
2. 参赛演示模式：显示 3 个内置案例和已填入的科研模板。
3. 讨论台：显示多 Agent 正在流式输出或已完成讨论。
4. 报告页：显示最终 Markdown 报告与导出按钮。
5. 外部论据页：显示 Agent 引用的论文、博客或数据集。
6. 历史页：显示已完成 Run、状态筛选和打包导出能力。

截图命名建议：

```text
docs/screenshots/107-model-settings.png
docs/screenshots/competition-demo-mode.png
docs/screenshots/agent-debate-stream.png
docs/screenshots/final-report-export.png
docs/screenshots/references-page.png
docs/screenshots/history-page.png
```

## 故障排查

- 如果模型列表读取失败，先检查 Base URL 是否为 `https://107.ustc.edu.cn/v1`，再检查 API Key 是否过期。
- 如果 TLS 校验失败，可在模型设置中临时开启“不安全 TLS”，但正式演示建议修复证书或网络代理问题。
- 如果输出中断，K-Storm 会检测结束标记和关键结构；失败 Run 可从历史记录中继续分析。
- 如果现场网络不稳定，可提前准备 mock provider 演示包，但正式材料中应说明真实模型调用使用 107 平台。
