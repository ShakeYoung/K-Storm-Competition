// 共享常量与纯工具函数：模板/场景/供应商预置/状态映射/文本工具。
// 从 main.jsx 拆出，供主应用与页面组件共同使用。

export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export const emptyTemplate = {
  field: "",
  background: "",
  existing_basis: "",
  extension_points: "",
  core_question: "",
  platforms: "",
  constraints: "",
  target_output: "",
  preferred_direction: "",
  avoid_direction: "",
};

export const SCENE_TEMPLATES = [
  {
    id: "undergrad-thesis",
    label: "本科毕设选题",
    template: {
      field: "（请填写你的研究领域，如：计算机视觉、生物信息学、材料科学）",
      background: "我是中国科学技术大学本科生，即将开始毕业设计。希望找到一个在本科阶段可以独立完成的选题，难度适中，有一定创新性，同时能在答辩中展示完整的研究过程。",
      existing_basis: "已完成本专业主干课程，有一定的编程/实验操作能力。有导师指导，实验室有基本设备。",
      extension_points: "希望选题能结合当前热点（如 AI 赋能、多模态数据、新材料等），并有清晰可操作的实验路线。",
      core_question: "",
      platforms: "（请填写可用的技术平台/工具，如：Python 编程环境、学校实验室设备、公开数据集）",
      constraints: "时间：约 6 个月；经费有限；样本/数据依赖公开资源或导师已有数据集。",
      target_output: "本科毕业论文 + 答辩 PPT，争取发表 1 篇会议论文或期刊短文。",
      preferred_direction: "方法创新型 / 应用落地型，选题要有实验可行性。",
      avoid_direction: "过于理论化、需要大规模计算集群或昂贵试剂耗材的方向。",
    },
  },
  {
    id: "grad-proposal",
    label: "研究生开题构思",
    template: {
      field: "（请填写你的研究领域，如：肿瘤免疫、自然语言处理、新能源材料）",
      background: "我是中国科学技术大学硕士/博士研究生，正在准备开题报告。需要在导师研究方向的框架内，找到一个有创新性、有发表潜力的具体课题切入点。",
      existing_basis: "已阅读领域内近 3 年的核心文献（请补充关键结论）。实验室已有相关数据/样本/模型系统（请补充）。",
      extension_points: "（请填写你已经有的初步想法或感兴趣的方向）",
      core_question: "（如有初步科学问题，请填写；没有可留空让 K-Storm 协助提炼）",
      platforms: "（请填写可用平台，如：RNA-seq、单细胞测序、动物模型、GPU 服务器、公共数据库）",
      constraints: "科研周期：硕士约 2 年 / 博士约 4 年；需在 1 年内完成预实验验证方向可行性。",
      target_output: "开题报告（面向导师和评审委员会）；中期至少 1 篇 SCI 一区论文。",
      preferred_direction: "机制研究 / 方法创新 / 交叉学科，要有明确的 novelty 和可发表点。",
      avoid_direction: "重复已有成熟结论的验证性工作；资源需求远超实验室现有条件的方向。",
    },
  },
  {
    id: "pivot-evaluation",
    label: "课题转向评估",
    template: {
      field: "（请填写当前研究领域）",
      background: "我目前正在推进的课题遇到了瓶颈或发现了偏差。需要评估是否应该调整当前路线，或转向备选方向。",
      existing_basis: "当前课题已完成的实验结果/数据：（请填写已有进展，包括成功的和失败的实验）。已投入的资源：（时间、样本、试剂等）。",
      extension_points: "（请描述当前遇到的问题：如结果与预期不符、实验重复性差、机制解释困难等）",
      core_question: "（请填写当前课题的核心科学问题，以及你认为卡住的根本原因）",
      platforms: "当前已有平台和工具：（请填写）；如转向，可调用的其他资源：（请填写）。",
      constraints: "剩余科研时间：（请填写）；已消耗预算：（请填写）；转向的机会成本：（请评估）。",
      target_output: "给导师/组会的转向评估报告；如转向，提供新方向的可行性分析。",
      preferred_direction: "能复用现有数据/平台的方向；风险可控、周期可预估。",
      avoid_direction: "需要从零开始学习全新技术栈的大转向；比当前课题风险更高的方向。",
    },
  },
  {
    id: "group-meeting",
    label: "组会讨论预演",
    template: {
      field: "（请填写你的研究领域，如：深度学习、结构生物学、量子材料）",
      background: "我是中国科学技术大学在读研究生，下周需要在组会上汇报进展并提出下一步计划。希望提前用多 Agent 讨论预演，找出方案的薄弱点和潜在的导师质疑方向。",
      existing_basis: "本学期已完成的实验/工作：（请填写），主要结论：（请填写）。目前卡点：（请描述实验未达预期或数据解释困难之处）。",
      extension_points: "（请填写你计划在组会上提出的下一步方案，K-Storm 将对其进行多角度批判和完善）",
      core_question: "（本次组会汇报的核心问题是什么？导师最可能质疑哪个环节？）",
      platforms: "（请填写实验室现有平台：仪器、数据库、合作单位等）",
      constraints: "组会时间约 20 分钟；导师关注点为结果的可重复性和下一步计划的可行性。",
      target_output: "组会汇报提纲 + 潜在问题应对清单；可直接用于 PPT 准备。",
      preferred_direction: "有明确实验结果支撑的方向；下一步方案能在 3 个月内出数据。",
      avoid_direction: "过于发散的探索；需要大量新资源投入的方案。",
    },
  },
];

export const COMPETITION_DEMOS = [
  {
    id: "demo-llm-security",
    label: "⚡ 一键演示：LLM 安全诊断（完整 run）",
    runId: "demo_llm_security",
    runName: "[演示] LLM 安全 · harness attack 机制诊断",
    template: {
      field: "大语言模型安全、prompt injection、agent harness security",
      background: "演示案例：已预跑完成的完整讨论（含 13 条 Agent 发言、结构化 IR、六维批判审查、28 条外部引用与最终报告），无需模型调用，点击即展示。",
      existing_basis: "预置演示 run，断网可用。",
    },
  },
  {
    id: "demo-group-meeting-ai",
    label: "组会预演：多模态科研助手",
    runName: "参赛演示-组会预演-多模态科研助手",
    template: {
      field: "多模态大模型与科研训练智能体",
      background: "课题组希望建设一个面向本科生科研训练的 AI 助手，帮助学生从文献阅读、问题拆解、实验设计到组会汇报形成闭环。当前已有若干课程项目和公开论文数据，但学生常见问题是选题过大、验证路径不清晰、组会汇报缺少可辩护的证据链。",
      existing_basis: "已有基础包括：1）课程项目中积累的 42 份学生开题草稿；2）实验室已有论文阅读模板和组会记录；3）可调用中国科大 107 算力平台上的通用对话模型和推理模型；4）已有一个 React + FastAPI 原型，可完成多 Agent 讨论和 Markdown 报告导出。",
      extension_points: "希望把系统从普通问答升级为科研决策工作台：由 Novelty、Mechanism、Feasibility、Reviewer 等 Agent 分工讨论，输出候选选题排序、风险批判、证据绑定和下一步行动清单。",
      core_question: "如何把多智能体系统设计成真正服务科研训练的工具，而不是停留在聊天式建议？哪些功能最能体现教学赋能和科研支持价值？",
      platforms: "中国科大 107 算力平台模型；OpenAI Compatible API；React/Vite 前端；FastAPI 后端；SQLite 本地历史库；Markdown/PDF/JSON 导出。",
      constraints: "参赛作品需要在演示现场稳定运行；输入材料可能包含未公开组会内容，因此优先本地存储；演示时间有限，需要 3-5 分钟内展示完整价值链。",
      target_output: "参赛演示报告、设计文档、系统演示视频脚本，以及可运行的智能体开发作品。",
      preferred_direction: "强调科研训练、组会决策、证据追踪和本地隐私；优先展示 107 平台模型适配和多 Agent 协作闭环。",
      avoid_direction: "避免泛化成通用聊天机器人；避免只展示界面而缺少结构化中间产物；避免依赖不可复现的在线数据源。",
    },
  },
  {
    id: "demo-result-diagnosis-bio",
    label: "结果诊断：单细胞实验偏差",
    runName: "参赛演示-结果诊断-单细胞实验偏差",
    template: {
      field: "肿瘤免疫与单细胞测序结果诊断",
      background: "课题原计划验证某免疫细胞亚群在治疗响应中的作用，但最新单细胞测序分析显示目标亚群比例变化不稳定，不同样本批次之间差异较大。学生需要在组会上说明结果是否仍支持原假设，并提出下一步补充实验。",
      existing_basis: "已有 18 例样本的 scRNA-seq 初步分析；目标细胞亚群在响应组中平均提高约 1.4 倍，但 p 值不稳定；两个批次的细胞捕获率差异明显；已有流式抗体面板和 6 例可追加验证样本。",
      extension_points: "可以考虑从细胞比例转向功能状态评分，或结合 TCR 克隆扩增、细胞通讯分析、流式验证来解释差异。也可以评估当前路线是否需要局部转向。",
      core_question: "当前结果到底是生物学异质性、批次效应，还是原假设不成立？下一步应优先做哪些低成本验证？",
      platforms: "Seurat/Scanpy 分析流程；流式细胞术；少量临床样本；公开单细胞数据库；实验室现有 qPCR 和免疫荧光平台。",
      constraints: "组会前还有 10 天；追加样本有限；预算不支持重新做大规模单细胞测序；需要在 4 周内给导师一个明确推进或调整建议。",
      target_output: "结果诊断报告、组会答辩要点、2-4 周补充实验计划。",
      preferred_direction: "优先复用现有数据；先做可快速证伪的验证；报告中明确区分确定结论、可疑结论和待验证假设。",
      avoid_direction: "避免直接扩大样本量但不解决批次问题；避免把统计不稳的趋势包装成强结论。",
    },
  },
  {
    id: "demo-undergrad-materials",
    label: "本科科研：催化材料选题",
    runName: "参赛演示-本科科研-催化材料选题",
    template: {
      field: "新能源催化材料与机器学习辅助筛选",
      background: "一名本科生希望围绕新能源催化材料做毕业设计，目标是在有限实验条件下形成完整研究闭环。学生有 Python 基础和材料化学课程背景，但没有足够时间开展大规模合成实验。",
      existing_basis: "已学习基本机器学习模型和材料数据库检索；实验室可提供少量电化学测试机会；导师已有部分过渡金属催化剂数据；学生可使用公开数据库和 107 算力平台进行模型训练或候选材料筛选。",
      extension_points: "希望结合公开材料数据、简单可解释模型和少量实验验证，提出一个难度适中但有创新性的毕设课题。",
      core_question: "如何设计一个本科阶段可完成、又能体现 AI 赋能材料科研的选题？候选方向应如何排序？",
      platforms: "Python、scikit-learn、公开材料数据库、107 算力平台、实验室电化学测试平台、导师已有小规模数据。",
      constraints: "总周期 6 个月；每周投入约 15 小时；实验验证机会有限；不能依赖昂贵试剂或大规模 DFT 计算。",
      target_output: "本科毕业论文、答辩 PPT、可复现实验代码和 1 个小规模验证结果。",
      preferred_direction: "可解释、可复现、实验闭环清晰；优先使用公开数据和现有平台。",
      avoid_direction: "避免纯模型刷榜；避免需要大量湿实验或昂贵计算资源的方案。",
    },
  },
];

export const requiredFields = ["field", "background", "existing_basis"];

export const ACTIVE_RUN_STATES = [
  "CREATED",
  "TEMPLATE_VALIDATED",
  "INTAKE_RUNNING",
  "DEBATE_RUNNING",
  "CRITIQUE_RUNNING",
  "GROUP_SUMMARY_RUNNING",
  "CITATION_REVIEW_RUNNING",
  "FINAL_REPORT_RUNNING",
];

export function statusBadgeClass(status) {
  if (status === "COMPLETED") return "completed";
  if (status === "FAILED") return "failed";
  if (status === "CANCELED") return "canceled";
  if (ACTIVE_RUN_STATES.includes(status)) return "running";
  return "pending";
}

export const formFields = [
  ["field", "研究领域", "如：肿瘤免疫、单细胞测序、材料催化"],
  ["background", "实验大背景", "当前领域问题、疾病背景、技术背景"],
  ["existing_basis", "已有研究基础", "已有数据、实验结果、模型系统、样本资源"],
  ["extension_points", "初步想法", "你已经想到的延伸点"],
  ["core_question", "核心科学问题", "不清楚可留空，KS 会协助提炼"],
  ["platforms", "可用技术平台", "RNA-seq、动物模型、细胞实验、临床队列等"],
  ["constraints", "资源限制", "时间、经费、样本量、仪器、合作条件"],
  ["target_output", "目标产出", "开题报告、组会讨论、毕业课题、预实验等"],
  ["preferred_direction", "偏好方向", "机制研究、方法开发、转化应用、交叉学科等"],
  ["avoid_direction", "避免方向", "明确不想做的方向"],
];

export const agentSlots = [
  ["intake", "入口 Agent", "结构化 briefing"],
  ["novelty", "创新性 Agent", "讨论组"],
  ["mechanism", "机制深挖 Agent", "讨论组"],
  ["feasibility", "可行性 Agent", "讨论组"],
  ["reviewer", "审稿人 Agent", "讨论组"],
  ["moderator", "Moderator", "冲突与遗漏"],
  ["critique", "Critique Agent", "独立批判"],
  ["citation_review", "Citation Review", "引用审查"],
  ["group_summarizer", "结构化 IR", "总结"],
  ["output", "出口 Agent", "最终报告"],
];

export const agentRecommendations = {
  intake: "推荐：长上下文、稳健理解模型，例如 科大107平台 GLM5.2 / DeepSeek-V4，用于全文消化模板和文档。",
  novelty: "推荐：创造性强、响应较快的模型，例如 科大107平台 DeepSeek-V3 / DeepSeek-V4，用于提出差异化方向。",
  mechanism: "推荐：推理稳定、机制链条表达强的模型，例如 科大107平台 GLM5.2 / DeepSeek-V4。",
  feasibility: "推荐：成本适中且执行细节可靠的模型，例如 科大107平台 DeepSeek-V3，用于压实实验路线。",
  reviewer: "推荐：批判性和长文本能力强的模型，例如 科大107平台 GLM5.2 / DeepSeek-V4，用于模拟审稿质疑。",
  moderator: "推荐：总结和对比能力强的中高质量模型，例如 科大107平台 GLM5.2，用于提炼第 1 轮冲突点和第 2 轮问题清单。",
  critique: "推荐：推理能力强的中等强度模型，例如 科大107平台 GLM5.2 / DeepSeek-V4，用于六维独立批判审查。",
  citation_review: "推荐：响应较快、结构化能力可靠的模型，例如 科大107平台 DeepSeek-V4-Flash / Qwen3.6-Chat，用于引用线索一致性检查。",
  group_summarizer: "推荐：结构化能力强的模型，例如 科大107平台 DeepSeek-V4，用于把多轮讨论压缩成稳定 IR。",
  output: "推荐：质量最高、中文写作稳定的模型，例如 科大107平台 GLM5.2 / DeepSeek-V4，用于生成最终 Markdown 报告。",
};

export const apiTypes = [
  ["openai_compatible", "OpenAI Compatible"],
  ["anthropic_messages", "Anthropic Messages"],
  ["openai_responses", "OpenAI Responses"],
];

export const providerGroups = [
  ["coding_plan", "CODING PLAN"],
  ["api", "API"],
];

export const PRESET_PROVIDER_IDS = new Set(["ustc-107", "kimi-coding", "bailian-coding", "volcengine-coding"]);

export const defaultModelSettings = {
  version: 9,
  providers: [
    {
      id: "ustc-107",
      name: "中国科大 107 算力平台",
      category: "api",
      api_key: "",
      base_url: "https://api.llm.ustc.edu.cn/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "kimi-coding",
      name: "Kimi Coding Plan",
      category: "coding_plan",
      api_key: "",
      base_url: "https://api.kimi.com/coding/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "bailian-coding",
      name: "百炼 Coding Plan",
      category: "coding_plan",
      api_key: "",
      base_url: "https://coding.dashscope.aliyuncs.com/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "volcengine-coding",
      name: "火山引擎 Coding Plan",
      category: "coding_plan",
      api_key: "",
      base_url: "https://ark.cn-beijing.volces.com/api/coding/v3",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      category: "api",
      api_key: "",
      base_url: "https://api.deepseek.com/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "dashscope",
      name: "DashScope (百炼 API)",
      category: "api",
      api_key: "",
      base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "api",
      api_key: "",
      base_url: "https://api.openai.com/v1",
      api_type: "openai_responses",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      category: "api",
      api_key: "",
      base_url: "https://openrouter.ai/api/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "ollama",
      name: "Ollama (Local)",
      category: "api",
      api_key: "ollama",
      base_url: "http://127.0.0.1:11434/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "minimax",
      name: "MiniMax",
      category: "api",
      api_key: "",
      base_url: "https://api.minimax.io/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
    {
      id: "siliconflow",
      name: "SiliconFlow",
      category: "api",
      api_key: "",
      base_url: "https://api.siliconflow.cn/v1",
      api_type: "openai_compatible",
      allow_insecure_tls: false,
      models: [],
    },
  ],
  assignments: {},
};

export function loadModelSettings() {
  try {
    return normalizeModelSettings(
      JSON.parse(localStorage.getItem("ks-model-settings-react")) ||
      JSON.parse(JSON.stringify(defaultModelSettings)),
    );
  } catch {
    return normalizeModelSettings(JSON.parse(JSON.stringify(defaultModelSettings)));
  }
}

export function normalizeModelSettings(settings) {
  const defaults = JSON.parse(JSON.stringify(defaultModelSettings));
  const existing = settings.providers || [];
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const defaultIds = new Set(defaults.providers.map((item) => item.id));
  const resetPresetModels = settings.version !== defaults.version;
  const cleanedCustomProviders = existing.filter(
    (item) =>
      !defaultIds.has(item.id) &&
      item.id !== "chatgpt-plus" &&
      item.api_type !== "chatgpt_codex" &&
      (item.category || "api") !== "oauth",
  );
  const providers = [
    ...defaults.providers.map((defaultProvider) => {
      const item = existingById.get(defaultProvider.id);
      if (!item) return defaultProvider;
      return {
        ...defaultProvider,
        ...item,
        category: item.category || defaultProvider.category || "api",
        base_url: resetPresetModels ? defaultProvider.base_url : item.base_url || defaultProvider.base_url,
        api_type: resetPresetModels ? defaultProvider.api_type : item.api_type || defaultProvider.api_type,
        models: resetPresetModels ? defaultProvider.models || [] : item.models || defaultProvider.models || [],
      };
    }),
    ...cleanedCustomProviders.map((item) => ({
      category: "api",
      ...item,
      models: item.models || [],
    })),
  ];
  const validModelValues = new Set(
    providers.flatMap((provider) => provider.models.map((model) => `${provider.id}:${model.id}`)),
  );
  const assignments = Object.fromEntries(
    Object.entries(settings.assignments || {}).filter(([, value]) => !value || validModelValues.has(value)),
  );
  return {
    ...settings,
    version: defaults.version,
    providers,
    assignments,
  };
}

export function inferRunRounds(run) {
  const timelineRounds = Math.max(
    0,
    ...(run?.timeline || []).map((step) => {
      const match = String(step?.key || "").match(/^debate_r(\d+)_/);
      return match ? Number.parseInt(match[1], 10) : 0;
    }),
  );
  if (timelineRounds > 0) return timelineRounds;
  return Math.max(1, ...(run?.debate_messages || []).map((message) => message.round || 0));
}

export function inferParallelFirstRound(run) {
  return (run?.timeline || []).some(
    (step) => step?.key?.startsWith("debate_r1_") && String(step?.label || "").includes("独立发言"),
  );
}

export function normalizeLoadedDocuments(documents = []) {
  return documents.map((document, index) => ({
    ...document,
    id: document.id || `doc-loaded-${Date.now()}-${index}`,
    note: document.note || "",
    summary: document.summary || "",
  }));
}

export function agentKeyFromDisplay(displayName) {
  const map = {
    "Novelty Agent": "novelty",
    "Mechanism Agent": "mechanism",
    "Feasibility Agent": "feasibility",
    "Reviewer Agent": "reviewer",
    "Moderator": "moderator",
    "Intake Agent": "intake",
    "Group Summarizer": "group_summarizer",
    "Output Agent": "output",
    "Critique Agent": "critique",
    "Citation Review Agent": "citation_review",
  };
  return map[displayName] || displayName.toLowerCase().split(" ")[0];
}

export const DEBATE_AGENTS = [
  { key: "novelty", label: "Novelty Agent", role: "创新性" },
  { key: "mechanism", label: "Mechanism Agent", role: "机制深挖" },
  { key: "feasibility", label: "Feasibility Agent", role: "可行性" },
  { key: "reviewer", label: "Reviewer Agent", role: "审稿/评审" },
];

export const ENTRY_TYPE_META = {
  direction:        { label: "候选方向", color: "#1A52B8" },
  decision_summary: { label: "决策摘要", color: "#1A7A5E" },
  key_claim:        { label: "关键主张", color: "#2D4DB5" },
  critique:         { label: "批判点",   color: "#B03050" },
  opportunity:      { label: "机会点",   color: "#6B4FB8" },
};

export const PERSPECTIVES = [
  { key: "mechanism", label: "机制原理", keywords: ["机制", "原理", "理论", "框架", "作用", "假说", "pathway", "mechanism"] },
  { key: "data",      label: "数据实验", keywords: ["数据", "实验", "样本", "测量", "观测", "实证", "验证", "数据集", "采集", "dataset"] },
  { key: "method",    label: "技术方法", keywords: ["方法", "算法", "技术", "路线", "方案", "流程", "策略", "工具", "method", "approach"] },
  { key: "resource",  label: "资源条件", keywords: ["资源", "设备", "条件", "经费", "成本", "计算", "硬件", "人力", "基础设施"] },
  { key: "risk",      label: "风险挑战", keywords: ["风险", "挑战", "困难", "局限", "不足", "缺陷", "瓶颈", "障碍", "限制", "limitation"] },
  { key: "transfer",  label: "应用转化", keywords: ["转化", "应用", "落地", "产品", "商业", "推广", "临床", "实用", "影响", "价值"] },
];

export function briefText(brief) {
  // structured_brief 是对象，不能直接拼进字符串（会变成 [object Object]）
  if (!brief) return "";
  if (typeof brief === "string") return brief;
  return [
    brief.research_context || "",
    ...(brief.known_facts || []),
    ...(brief.unknowns || []),
    ...(brief.constraints || []),
    ...(brief.opportunity_points || []),
    brief.intake_synthesis || "",
  ].filter(Boolean).join(" ");
}

export function inferDocumentType(name) {
  const lower = name.toLowerCase();
  if (lower.includes("design") || lower.includes("方案") || lower.includes("设计")) {
    return "design";
  }
  if (lower.includes("data") || lower.includes("experiment") || lower.includes("实验")) {
    return "experiment-data";
  }
  return "other";
}

export function formatChars(count) {
  return count >= 10000 ? `${(count / 10000).toFixed(1)} 万` : String(count);
}

export async function readError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.detail || text;
  } catch {
    return text;
  }
}
