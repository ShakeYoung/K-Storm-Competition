import React from "react";
import {
  API_BASE,
  PRESET_PROVIDER_IDS,
  agentRecommendations,
  agentSlots,
  apiTypes,
  defaultModelSettings,
  providerGroups,
  readError,
} from "../lib/constants.js";

function SettingsModal({ settings, setSettings, onClose, setError }) {
  const [activeProviderId, setActiveProviderId] = React.useState(
    settings.providers[0]?.id,
  );
  const [discoveredModels, setDiscoveredModels] = React.useState({});
  const [modelSearch, setModelSearch] = React.useState("");
  const [collapsedCandidates, setCollapsedCandidates] = React.useState({});
  const activeProvider =
    settings.providers.find((provider) => provider.id === activeProviderId) ??
    settings.providers[0];
  const modelOptions = settings.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}:${model.id}`,
      label: `${provider.name} / ${model.name}`,
    })),
  );

  function buildRecommendedAssignments(modelPool) {
    // modelPool: [{ value: "providerId:modelId", searchText: "provider name model" }]
    function pick(keywords, fallbackIdx) {
      for (const kws of keywords) {
        const found = modelPool.find((o) => kws.every((k) => o.searchText.includes(k)));
        if (found) return found.value;
      }
      return modelPool[fallbackIdx ?? 0]?.value || "";
    }
    const map = {
      // 重型 Agent（入口/创新/机制/审稿/汇总/输出）: 优先 107 高阶推理层 deepseek-v4-pro / glm-5.2
      intake:          pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["gpt", "5.5"], ["claude", "opus"], ["deepseek", "pro"], ["glm", "5.1"], ["mimo", "pro"], ["qwen", "max"]]),
      novelty:         pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["gpt", "5.5"], ["claude", "opus"], ["mimo", "pro"], ["flash"], ["plus"]]),
      mechanism:       pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["gpt", "5.5"], ["claude", "opus"], ["deepseek", "pro"], ["mimo", "pro"], ["qwen", "max"]]),
      reviewer:        pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["claude", "opus"], ["gpt", "5.5"], ["deepseek", "pro"], ["mimo", "pro"]]),
      group_summarizer:pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["deepseek", "pro"], ["gpt", "5.4"], ["glm", "5.1"], ["claude", "opus"]]),
      output:          pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["glm", "5.2"], ["qwen3.6", "reason"], ["gpt", "5.5"], ["claude", "opus"], ["deepseek", "pro"], ["mimo", "pro"], ["qwen", "max"]]),
      // 轻型 Agent（可行性/主持）: 优先 107 高效通用层 deepseek-v4-flash / qwen3.6-chat
      feasibility:     pick([["deepseek-v4-flash"], ["qwen3.6", "chat"], ["qwen-chat"], ["deepseek-v4"], ["glm-5.2"], ["gpt", "5.4"], ["deepseek", "pro"], ["flash"], ["plus"], ["turbo"]]),
      moderator:       pick([["deepseek-v4-flash"], ["qwen3.6", "chat"], ["qwen-chat"], ["smart", "default"], ["deepseek-v4"], ["gpt", "5.4"], ["flash"], ["plus"], ["turbo"], ["mimo", "v2.5"]]),
      // Critique 批判（中等强度，需要一定推理能力）
      critique:        pick([["deepseek-v4-pro"], ["glm-5.2"], ["deepseek-v4"], ["qwen3.6", "reason"], ["gpt", "5.5"], ["claude", "opus"], ["deepseek-v4-flash"], ["qwen3.6", "chat"]]),
      // Citation Review（轻量核查，速度优先）
      citation_review: pick([["deepseek-v4-flash"], ["qwen3.6", "chat"], ["qwen-chat"], ["smart", "default"], ["deepseek-v4"], ["flash"], ["plus"]]),
    };
    const filtered = {};
    for (const [k, v] of Object.entries(map)) { if (v) filtered[k] = v; }
    return filtered;
  }

  function applyRecommendedConfig() {
    const allModels = settings.providers.flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.id}:${m.id}`,
        searchText: `${p.name} ${m.name} ${m.model}`.toLowerCase(),
      })),
    );
    if (!allModels.length) { setError("请先添加至少一个模型。"); return; }
    const assignments = buildRecommendedAssignments(allModels);
    setSettings((s) => ({ ...s, assignments: { ...s.assignments, ...assignments } }));
    setError("");
  }

  async function quickSetupProvider() {
    // 预置平台一键配置：读取全部模型 → 写入 provider.models（去重）→ 自动生成推荐分配
    try {
      const response = await fetch(`${API_BASE}/api/models/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeProvider),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      const fetched = (data.models || []).map((model) => ({
        id: model.id,
        name: model.name,
        model: model.model,
        context_window: model.context_window || "",
      }));
      const merged = [
        ...activeProvider.models,
        ...fetched.filter((m) => !activeProvider.models.some((existing) => existing.model === m.model)),
      ];
      setDiscoveredModels((current) => ({ ...current, [activeProvider.id]: fetched }));
      setCollapsedCandidates((current) => ({ ...current, [activeProvider.id]: false }));
      setModelSearch("");
      const pool = merged.map((m) => ({
        value: `${activeProvider.id}:${m.id}`,
        searchText: `${activeProvider.name} ${m.name} ${m.model}`.toLowerCase(),
      }));
      const assignments = buildRecommendedAssignments(pool);
      setSettings((current) => ({
        ...current,
        providers: current.providers.map((p) =>
          p.id === activeProvider.id ? { ...p, models: merged } : p,
        ),
        assignments: { ...current.assignments, ...assignments },
      }));
      // 演示提示：模型已就绪，但缺 API Key 时运行会失败
      if (!activeProvider.api_key) {
        setError("⚡ 模型已分配完成。运行前请在上方填写该供应商的 API Key；未填写时无法调用真实模型。");
      } else {
        setError("");
      }
    } catch (err) {
      setError(err.message || "一键配置失败");
    }
  }

  function updateProvider(patch) {
    setSettings((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === activeProvider.id ? { ...provider, ...patch } : provider,
      ),
    }));
  }

  function addProvider() {
    const id = `provider-${Date.now()}`;
    setSettings((current) => ({
      ...current,
      providers: [
        ...current.providers,
        {
          id,
          name: "新供应商",
          category: "api",
          api_key: "",
          base_url: "",
          api_type: "openai_compatible",
          allow_insecure_tls: false,
          models: [],
        },
      ],
    }));
    setActiveProviderId(id);
  }

  function deleteProvider() {
    const deletedId = activeProvider.id;
    setSettings((current) => {
      const providers = current.providers.filter(
        (provider) => provider.id !== deletedId,
      );
      const assignments = { ...current.assignments };
      for (const key of Object.keys(assignments)) {
        if (assignments[key].startsWith(`${deletedId}:`)) delete assignments[key];
      }
      return {
        providers: providers.length ? providers : defaultModelSettings.providers,
        assignments,
      };
    });
    // 修复：原实现读取删除前的 settings.providers[0]，删除第一个供应商时 active 会指向已删除 id；
    // 改为从剩余列表里取下一个 active（删除的不是第一个则保持当前选择不变）
    const nextActive = settings.providers.find((provider) => provider.id !== deletedId);
    setActiveProviderId(nextActive?.id || defaultModelSettings.providers[0]?.id || "");
  }

  function addModel() {
    addModelFromCandidate(null);
  }

  function addModelFromCandidate(candidate) {
    const typed = modelSearch.trim();
    const source = candidate || (typed ? { id: typed, name: typed, model: typed } : null);
    if (!source) {
      setError("请先读取模型并选择，或手动输入模型 ID。");
      return;
    }
    const modelId = source.model || source.id;
    if (activeProvider.models.some((model) => model.model === modelId)) {
      setError("该模型已添加。");
      return;
    }
    const next = {
      id: activeProvider.models.some((model) => model.id === source.id)
        ? `${source.id}-${Date.now()}`
        : source.id || `model-${Date.now()}`,
      name: source.name || modelId,
      model: modelId,
      context_window: source.context_window || "",
    };
    updateProvider({ models: [...activeProvider.models, next] });
    setModelSearch("");
    setError("");
  }

  function updateModel(modelId, patch) {
    updateProvider({
      models: activeProvider.models.map((model) =>
        model.id === modelId ? { ...model, ...patch } : model,
      ),
    });
  }

  function removeModel(modelId) {
    updateProvider({
      models: activeProvider.models.filter((model) => model.id !== modelId),
    });
  }

  async function discoverModels() {
    try {
      const response = await fetch(`${API_BASE}/api/models/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeProvider),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      const fetched = data.models.map((model) => ({
        id: model.id,
        name: model.name,
        model: model.model,
        context_window: model.context_window || "",
      }));
      setDiscoveredModels((current) => ({
        ...current,
        [activeProvider.id]: fetched,
      }));
      setCollapsedCandidates((current) => ({ ...current, [activeProvider.id]: false }));
      setModelSearch("");
      // 预置平台（USTC 107 / Coding Plan）：读取即直接写入已添加列表，无需逐个添加
      if (PRESET_PROVIDER_IDS.has(activeProvider.id) && fetched.length) {
        updateProvider({
          models: [
            ...activeProvider.models,
            ...fetched.filter((m) => !activeProvider.models.some((existing) => existing.model === m.model)),
          ],
        });
      }
      setError("");
    } catch (err) {
      setError(err.message || "读取模型失败");
    }
  }

  const candidateModels = React.useMemo(() => {
    const added = new Set(activeProvider?.models.map((model) => model.model) || []);
    const query = modelSearch.toLowerCase();
    return (discoveredModels[activeProvider?.id] || [])
      .filter((model) => !added.has(model.model || model.id))
      .filter((model) => {
        const text = `${model.name || ""} ${model.model || ""} ${model.id || ""}`.toLowerCase();
        return !query || text.includes(query);
      });
  }, [activeProvider, discoveredModels, modelSearch]);

  return (
    <section className="settings-backdrop">
      <div className="settings-modal">
        <aside className="settings-sidebar">
          <div className="panel-title">
            <div>
              <h2>供应商</h2>
              <p>API Key 仅保存在本机浏览器。</p>
            </div>
          </div>
          <div className="provider-list">
            {providerGroups.map(([category, label]) => {
              const providers = settings.providers.filter(
                (provider) => (provider.category || "api") === category,
              );
              if (!providers.length) return null;
              return (
                <React.Fragment key={category}>
                  <div className="provider-group">{label}</div>
                  {providers.map((provider) => (
                    <button
                      className={`provider-row ${provider.id === activeProvider?.id ? "active" : ""}`}
                      key={provider.id}
                      onClick={() => setActiveProviderId(provider.id)}
                    >
                      <span>{provider.name}</span>
                      <small>{provider.models.length}</small>
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
          <button className="icon-button" onClick={addProvider}>添加供应商</button>
        </aside>

        <section className="settings-content">
          <div className="panel-title">
            <div>
              <h2>{activeProvider?.name || "模型供应商"}</h2>
              <p>支持 OpenAI Compatible、Anthropic Messages、OpenAI Responses。</p>
            </div>
            <button className="danger-button" onClick={deleteProvider}>删除供应商</button>
          </div>

          <div className="settings-form">
            <label className="field">
              <span>名称</span>
              <input
                value={activeProvider?.name || ""}
                onChange={(event) => updateProvider({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                value={activeProvider?.api_key || ""}
                onChange={(event) => updateProvider({ api_key: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                value={activeProvider?.base_url || ""}
                placeholder="https://api.deepseek.com/v1"
                onChange={(event) => updateProvider({ base_url: event.target.value })}
              />
            </label>
            <label className="field">
              <span>API 类型</span>
              <select
                value={activeProvider?.api_type || "openai_compatible"}
                onChange={(event) => updateProvider({ api_type: event.target.value })}
              >
                {apiTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>证书校验</span>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(activeProvider?.allow_insecure_tls)}
                  onChange={(event) =>
                    updateProvider({ allow_insecure_tls: event.target.checked })
                  }
                />
                允许不安全证书
              </div>
            </label>
          </div>

          <div className="panel-title">
            <div><h3>已添加的模型 {activeProvider?.models.length || 0}</h3></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {PRESET_PROVIDER_IDS.has(activeProvider?.id) ? (
                <button className="icon-button" style={{ fontWeight: 700 }} onClick={quickSetupProvider}>
                  ⚡ 一键配置（读取全部模型 + 推荐分配）
                </button>
              ) : null}
              <button className="icon-button" onClick={discoverModels}>读取模型</button>
            </div>
          </div>
          <div className="settings-list">
            {activeProvider?.models.map((model) => (
              <div className="model-row" key={model.id}>
                <input
                  value={model.name}
                  onChange={(event) => updateModel(model.id, { name: event.target.value })}
                />
                <input
                  value={model.model}
                  onChange={(event) => updateModel(model.id, { model: event.target.value })}
                />
                <button className="danger-button" onClick={() => removeModel(model.id)}>
                  删除
                </button>
              </div>
            ))}
          </div>
          <div className="model-picker">
            <div className="model-picker-row">
              <input
                value={modelSearch}
                placeholder="搜索或输入模型 ID"
                onChange={(event) => setModelSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addModelFromCandidate(candidateModels[0] || null);
                  }
                }}
              />
              <button className="icon-button" onClick={addModel}>添加模型</button>
            </div>
            {(candidateModels.length ||
              modelSearch ||
              discoveredModels[activeProvider?.id]?.length) ? (
              <div className="model-candidate-list open">
                {collapsedCandidates[activeProvider?.id] ? (
                  <div className="model-candidate-head">
                    <span>模型候选已收起</span>
                    <button
                      onClick={() =>
                        setCollapsedCandidates((current) => ({
                          ...current,
                          [activeProvider.id]: false,
                        }))
                      }
                    >
                      展开
                    </button>
                  </div>
                ) : (
                  <>
                    {discoveredModels[activeProvider?.id]?.length ? (
                      <div className="model-candidate-head">
                        <span>候选模型 {candidateModels.length}</span>
                        <button
                          onClick={() =>
                            setCollapsedCandidates((current) => ({
                              ...current,
                              [activeProvider.id]: true,
                            }))
                          }
                        >
                          收起
                        </button>
                      </div>
                    ) : null}
                    {candidateModels.length ? (
                      candidateModels.slice(0, 80).map((model) => (
                        <button
                          className="model-candidate"
                          key={model.id}
                          onClick={() => addModelFromCandidate(model)}
                        >
                          <span>{model.name || model.model || model.id}</span>
                          <small>{model.context_window || ""}</small>
                        </button>
                      ))
                    ) : (
                      <div className="empty-line">
                        {discoveredModels[activeProvider?.id]?.length && !modelSearch
                          ? "读取成功，候选模型已全部添加。可在下方 Agent 模型位置中选择，或点击“推荐配置”。"
                          : "回车或点击“添加模型”添加输入的模型 ID。"}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ display: "inline" }}>Agent 模型位置</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>为不同模块分配不同能力侧重的模型。</span>
            </div>
            <button className="primary-action" style={{ minHeight: 28, fontSize: 12, whiteSpace: "nowrap" }} onClick={applyRecommendedConfig}>推荐配置</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {agentSlots.map(([key, label, group]) => (
              <div key={key} style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "var(--ink)" }}>{label}</strong>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{group}</span>
                </div>
                <select
                  value={settings.assignments[key] || ""}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      assignments: {
                        ...current.assignments,
                        [key]: event.target.value,
                      },
                    }))
                  }
                  style={{ fontSize: 12, minHeight: 32 }}
                >
                  <option value="">本地 Mock</option>
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{agentRecommendations[key]}</span>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button className="icon-button" onClick={onClose}>关闭</button>
          </div>
        </section>
      </div>
    </section>
  );
}

export default SettingsModal;
