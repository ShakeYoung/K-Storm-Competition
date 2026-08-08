import React from "react";
import { DEBATE_AGENTS } from "../lib/constants.js";

function ModeSelector({ mode, onChange, researchStage, setResearchStage, selectedAgents, setSelectedAgents, probeAgent, setProbeAgent, probeQuestion, setProbeQuestion, rounds, setRounds, parallelFirstRound, setParallelFirstRound }) {
  const modes = [
    { key: "full", label: "完整讨论", desc: "多轮全员辩论 + IR 总结", agents: "4 讨论 + 6 编排", rounds: "2-5" },
    { key: "focused", label: "聚焦小节", desc: "仅关键 Agent 精准讨论", agents: "2-3", rounds: "1-2" },
    { key: "quick", label: "快速探测", desc: "单 Agent 单次问答", agents: 1, rounds: "1" },
    { key: "memory", label: "记忆查询", desc: "检索历史 Run 的洞察", agents: 0, rounds: "0" },
  ];

  function toggleAgent(key) {
    setSelectedAgents((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const stages = [
    ["auto", "自动判断", "根据输入信息密度自动选择输出侧重点"],
    ["topic_exploration", "选题探索", "信息较少时，给出候选课题和方向建议"],
    ["plan_refinement", "方案收敛", "已有课题/设计时，帮助推进和完善实验"],
    ["result_diagnosis", "结果诊断", "已有实验结果时，解释现象并设计补充验证"],
    ["pivot_evaluation", "转向评估", "路线偏差较大时，评估修正或转向条件"],
  ];

  return (
    <div className="mode-selector">
      <div className="mode-selector-title">讨论模式</div>
      <div className="mode-selector-desc">选择适合当前场景的工作流模式</div>
      <div className="mode-options">
        {modes.map((m) => (
          <button
            key={m.key}
            className={`mode-option ${mode === m.key ? "active" : ""}`}
            onClick={() => onChange(m.key)}
          >
            <div className="mode-option-header">
              <strong style={{ whiteSpace: "nowrap" }}>{m.label}</strong>
              <span className="mode-option-sub">{m.desc}</span>
            </div>
            <div className="mode-option-meta">
              <span>{m.agents} Agent · {m.rounds} 轮</span>
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>科研阶段</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {stages.map(([key, label, desc]) => (
            <button
              key={key}
              className={`mode-option ${researchStage === key ? "active" : ""}`}
              onClick={() => setResearchStage(key)}
              style={{ flex: "1 1 auto", minWidth: 0 }}
              title={desc}
            >
              <strong style={{ whiteSpace: "nowrap", fontSize: 13 }}>{label}</strong>
              <span className="mode-option-sub">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "focused" ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>选择参与的 Agent（2-3 个）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEBATE_AGENTS.map((a) => (
              <button
                key={a.key}
                className={`icon-button ${selectedAgents.includes(a.key) ? "active" : ""}`}
                style={{
                  background: selectedAgents.includes(a.key) ? "var(--accent-soft)" : undefined,
                  borderColor: selectedAgents.includes(a.key) ? "var(--accent)" : undefined,
                  color: selectedAgents.includes(a.key) ? "var(--accent-strong)" : undefined,
                  fontSize: 13,
                }}
                onClick={() => toggleAgent(a.key)}
              >
                {a.role}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "quick" ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>选择提问的 Agent</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEBATE_AGENTS.map((a) => (
              <button
                key={a.key}
                className={`icon-button ${probeAgent === a.key ? "active" : ""}`}
                style={{
                  background: probeAgent === a.key ? "var(--accent-soft)" : undefined,
                  borderColor: probeAgent === a.key ? "var(--accent)" : undefined,
                  color: probeAgent === a.key ? "var(--accent-strong)" : undefined,
                  fontSize: 13,
                }}
                onClick={() => setProbeAgent(a.key)}
              >
                {a.role}
              </button>
            ))}
          </div>
          <label className="field">
            <span>具体问题</span>
            <textarea
              rows={2}
              value={probeQuestion}
              placeholder="输入你想问的具体问题，留空则基于模板背景自动生成"
              onChange={(e) => setProbeQuestion(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {mode === "memory" ? (
        <div style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
          记忆查询模式将检索历史 Run 的结构化结论。此功能需要先有至少一次完整讨论的记录。
        </div>
      ) : null}

      {(mode === "full" || mode === "focused") ? (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>讨论轮次</span>
          <input
            type="text"
            inputMode="numeric"
            value={rounds}
            style={{ width: 56, textAlign: "center", fontSize: 14, fontWeight: 600 }}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^0-9]/g, "");
              if (raw === "") { setRounds(""); return; }
              const value = Number.parseInt(raw, 10);
              const maxR = mode === "focused" ? 2 : 5;
              setRounds(Math.min(maxR, Math.max(1, value)));
            }}
            onBlur={() => {
              const maxR = mode === "focused" ? 2 : 5;
              const r = Number.parseInt(rounds, 10);
              setRounds(Number.isFinite(r) && r >= 1 ? Math.min(maxR, r) : (mode === "focused" ? 1 : 3));
            }}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>轮（{mode === "focused" ? "1-2" : "1-5"}）</span>
        </div>
      ) : null}

      {mode === "full" ? (
        <label className="checkbox-row parallel-option" style={{ marginTop: 8 }}>
          <input
            checked={parallelFirstRound}
            type="checkbox"
            onChange={(event) => setParallelFirstRound(event.target.checked)}
          />
          <span>第 1 轮并行独立发言</span>
        </label>
      ) : null}
    </div>
  );
}

export default ModeSelector;
