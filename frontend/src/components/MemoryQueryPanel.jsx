import React from "react";
import { Brain, FlaskConical, Play, Search } from "lucide-react";
import { API_BASE, DEBATE_AGENTS, ENTRY_TYPE_META } from "../lib/constants.js";
import { markdownToHtml } from "../lib/markdown.js";

function MemoryQueryPanel({ history, run, setRun, setError, onStartRun }) {
  // ── 标签页 ──────────────────────────────────────────────────────
  const [tab, setTab] = React.useState("single"); // "single" | "search"

  // ── 单 Run 对话 ─────────────────────────────────────────────────
  const [selectedRunId, setSelectedRunId] = React.useState("");
  const [loadedRun, setLoadedRun] = React.useState(null);
  const [memoryAgents, setMemoryAgents] = React.useState(["novelty", "mechanism"]);
  const [memoryRounds, setMemoryRounds] = React.useState(1);
  const [memoryParallel, setMemoryParallel] = React.useState(false);
  const [memoryQuestion, setMemoryQuestion] = React.useState("");

  // ── 跨 Run TF-IDF 检索 ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchFieldFilter, setSearchFieldFilter] = React.useState("");
  const [searchResults, setSearchResults] = React.useState(null);
  const [searchMeta, setSearchMeta] = React.useState(null);
  const [searchLoading, setSearchLoading] = React.useState(false);

  const completedRuns = React.useMemo(
    () => history.filter((h) => h.status === "COMPLETED"),
    [history],
  );

  // ── 单 Run 方法 ─────────────────────────────────────────────────
  async function loadMemory() {
    if (!selectedRunId) return;
    try {
      const resp = await fetch(`${API_BASE}/api/runs/${selectedRunId}`);
      if (!resp.ok) throw new Error("加载失败");
      const data = await resp.json();
      setLoadedRun(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function resetSelection() {
    setLoadedRun(null);
    setSelectedRunId("");
    setMemoryQuestion("");
  }

  function toggleAgent(key) {
    setMemoryAgents((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function handleStart() {
    if (!loadedRun || !memoryQuestion.trim()) return;
    const newTemplate = {
      ...loadedRun.template_input,
      core_question: memoryQuestion,
    };
    onStartRun({
      templateOverride: newTemplate,
      sourceRunId: loadedRun.run_id,
      overrideMode: "memory",
      selectedAgents: memoryAgents,
      rounds: memoryRounds,
      parallelFirstRound: memoryParallel,
    });
  }

  // ── 跨 Run 检索方法 ─────────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults(null);
    setSearchMeta(null);
    try {
      const resp = await fetch(`${API_BASE}/api/memory/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: searchQuery,
          field_filter: searchFieldFilter,
          top_k: 8,
        }),
      });
      if (!resp.ok) throw new Error("检索失败");
      const data = await resp.json();
      setSearchResults(data.hits);
      setSearchMeta({ indexed: data.total_entries_indexed, runs: data.total_runs_searched });
    } catch (err) {
      setError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  // Build summary from structured_brief
  const brief = loadedRun?.structured_brief;
  const summaryItems = React.useMemo(() => {
    if (!brief) return [];
    const items = [];
    if (brief.known_facts?.length) items.push({ label: "已知事实", values: brief.known_facts.slice(0, 3) });
    if (brief.unknowns?.length) items.push({ label: "未知问题", values: brief.unknowns.slice(0, 3) });
    if (brief.constraints?.length) items.push({ label: "约束条件", values: brief.constraints.slice(0, 2) });
    if (brief.opportunity_points?.length) items.push({ label: "机会点", values: brief.opportunity_points.slice(0, 2) });
    return items;
  }, [brief]);

  return (
    <div className="panel" style={{ display: "grid", gap: 16, overflow: "auto" }}>
      <div className="pane-heading">
        <div>
          <h2>记忆查询</h2>
          <p>从历史讨论中提取知识，支持单 Run 对话与跨 Run TF-IDF 检索。</p>
        </div>
      </div>

      {/* ── 标签页切换 ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--border)" }}>
        {[
          { key: "single", label: "单 Run 对话" },
          { key: "search", label: "跨 Run 知识检索" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -2,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: tab === key ? 700 : 400,
              color: tab === key ? "var(--accent-strong)" : "var(--muted)",
              cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </div>

      {!completedRuns.length ? (
        <div className="empty-state">
          <FlaskConical size={28} />
          <span>还没有已完成的历史讨论。请先运行一次完整讨论模式。</span>
        </div>
      ) : tab === "single" ? (
        /* ══════════════ 单 Run 对话标签页 ══════════════ */
        loadedRun ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "12px 16px" }}>
              <div>
                <div style={{ color: "var(--accent-strong)", fontWeight: 700, fontSize: 14 }}>已读取记忆：{loadedRun.template_input?.field || loadedRun.run_id}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{new Date(loadedRun.created_at).toLocaleString()} · {loadedRun.debate_messages?.length || 0} 条发言</div>
              </div>
              <button className="icon-button" onClick={resetSelection} style={{ fontSize: 12, minHeight: 32 }}>
                重新选择
              </button>
            </div>

            {summaryItems.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>记忆摘要</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {summaryItems.map(({ label, values }) => (
                    <div key={label} style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 4 }}>{label}</div>
                      {values.map((v, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5, overflowWrap: "break-word", wordBreak: "break-word" }}>· {v}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {brief?.intake_synthesis ? (
              <div style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 6 }}>入口整合 Briefing</div>
                <div
                  className="markdown-rendered"
                  style={{ fontSize: 13, lineHeight: 1.6, maxHeight: 160, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(brief.intake_synthesis.slice(0, 800) + (brief.intake_synthesis.length > 800 ? "..." : "")) }}
                />
              </div>
            ) : null}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>配置讨论参数</div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>选择 Agent</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DEBATE_AGENTS.map((a) => (
                    <button
                      key={a.key}
                      className="icon-button"
                      style={{
                        background: memoryAgents.includes(a.key) ? "var(--accent-soft)" : undefined,
                        borderColor: memoryAgents.includes(a.key) ? "var(--accent)" : undefined,
                        color: memoryAgents.includes(a.key) ? "var(--accent-strong)" : undefined,
                        fontSize: 12, minHeight: 30,
                      }}
                      onClick={() => toggleAgent(a.key)}
                    >{a.role}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>讨论轮次</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={memoryRounds}
                  style={{ width: 48, textAlign: "center", fontSize: 14, fontWeight: 600 }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    if (raw === "") { setMemoryRounds(""); return; }
                    setMemoryRounds(Math.min(5, Math.max(1, Number.parseInt(raw, 10))));
                  }}
                  onBlur={() => {
                    const r = Number.parseInt(memoryRounds, 10);
                    setMemoryRounds(Number.isFinite(r) && r >= 1 ? Math.min(5, r) : 1);
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>轮（1-5）</span>
              </div>

              <label className="checkbox-row parallel-option" style={{ marginTop: 0 }}>
                <input
                  checked={memoryParallel}
                  type="checkbox"
                  onChange={(e) => setMemoryParallel(e.target.checked)}
                />
                <span>第 1 轮并行独立发言</span>
              </label>

              <label className="field">
                <span>新问题</span>
                <textarea
                  rows={3}
                  value={memoryQuestion}
                  placeholder="基于记忆提出新问题，例如：上次讨论提到的 XX 方向，如果从 YY 角度切入会怎样？"
                  onChange={(e) => setMemoryQuestion(e.target.value)}
                />
              </label>

              <button
                className="primary-action"
                disabled={!memoryQuestion.trim() || memoryAgents.length < 1}
                onClick={handleStart}
              >
                <Play size={18} />
                启动讨论
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>选择历史讨论</div>
            <div className="history-list">
              {completedRuns.map((item) => (
                <button
                  key={item.run_id}
                  className={`history-item ${selectedRunId === item.run_id ? "active" : ""}`}
                  onClick={() => setSelectedRunId(item.run_id)}
                  style={{
                    cursor: "pointer",
                    borderLeft: selectedRunId === item.run_id ? "4px solid var(--accent)" : undefined,
                    background: selectedRunId === item.run_id ? "var(--accent-soft)" : undefined,
                  }}
                >
                  <span>{item.run_name || item.field}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
            <button className="primary-action" disabled={!selectedRunId} onClick={loadMemory} style={{ marginTop: 4 }}>
              <Brain size={18} />
              读取记忆
            </button>
          </div>
        )
      ) : (
        /* ══════════════ 跨 Run TF-IDF 检索标签页 ══════════════ */
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 14px", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            从所有已完成的 Run 的结构化 IR 中提取知识单元（候选方向、关键主张、机会点等），使用 TF-IDF 余弦相似度检索与你的查询最相关的条目。
          </div>

          {/* 查询输入 */}
          <div style={{ display: "grid", gap: 10 }}>
            <label className="field" style={{ margin: 0 }}>
              <span>查询问题</span>
              <textarea
                rows={2}
                value={searchQuery}
                placeholder="例如：蛋白质折叠预测有哪些突破性方向？或：如何提升小样本学习的泛化能力？"
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch(); } }}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>研究领域过滤（可选）</span>
              <input
                type="text"
                value={searchFieldFilter}
                placeholder="例如：计算生物学（空则不过滤）"
                onChange={(e) => setSearchFieldFilter(e.target.value)}
              />
            </label>
            <button
              className="primary-action"
              disabled={!searchQuery.trim() || searchLoading}
              onClick={handleSearch}
              style={{ marginTop: 4 }}
            >
              <Search size={16} />
              {searchLoading ? "检索中…" : "TF-IDF 检索"}
            </button>
          </div>

          {/* 检索结果 */}
          {searchMeta && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              已索引 {searchMeta.indexed} 条知识单元（来自 {searchMeta.runs} 次 Run）
              {searchResults !== null && `，命中 ${searchResults.length} 条`}
            </div>
          )}

          {searchResults !== null && searchResults.length === 0 && (
            <div className="empty-state" style={{ minHeight: 80 }}>
              <Search size={20} />
              <span>没有找到相关知识单元。尝试换一种表述或去掉领域过滤。</span>
            </div>
          )}

          {searchResults !== null && searchResults.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {searchResults.map((hit, i) => {
                const meta = ENTRY_TYPE_META[hit.entry.entry_type] || { label: hit.entry.entry_type, color: "#888" };
                const scorePercent = Math.round(hit.score * 100);
                return (
                  <div
                    key={hit.entry.entry_id}
                    style={{
                      background: "var(--panel-bg)",
                      border: "1px solid var(--border)",
                      borderLeft: `4px solid ${meta.color}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "12px 14px",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {/* 头部：类型徽章 + 标题 + 分数 */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{
                        flexShrink: 0,
                        background: meta.color + "22",
                        color: meta.color,
                        border: `1px solid ${meta.color}44`,
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 7px",
                      }}>{meta.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: 1, lineHeight: 1.4 }}>{hit.entry.title}</span>
                      <span style={{ flexShrink: 0, fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                        {scorePercent > 0 ? `${scorePercent}%` : "< 1%"}
                      </span>
                    </div>

                    {/* 内容预览 */}
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                      {hit.entry.content}
                    </div>

                    {/* 来源信息 */}
                    <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>📁 {hit.entry.field}</span>
                      <span>🏷 {hit.entry.run_name}</span>
                      <span>🕐 {new Date(hit.entry.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MemoryQueryPanel;
