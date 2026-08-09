import React from "react";
import { BookOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { API_BASE, readError, statusBadgeClass } from "../lib/constants.js";
import { markdownToHtml } from "../lib/markdown.js";
import DownloadMenu from "./DownloadMenu.jsx";

const VERIFY_LABEL = {
  verified: { text: "已核验", cls: "completed", icon: "✓" },
  mismatch: { text: "不一致", cls: "failed", icon: "⚠" },
  not_found: { text: "未找到", cls: "pending", icon: "?" },
  pending: { text: "待核验", cls: "pending", icon: "⏳" },
  skipped: { text: "跳过", cls: "pending", icon: "–" },
};

function VerifyBadge({ verification }) {
  if (!verification) return null;
  const meta = VERIFY_LABEL[verification.status] || VERIFY_LABEL.pending;
  return (
    <span
      className={`status-badge ${meta.cls}`}
      title={verification.detail || ""}
      style={{ fontSize: 10, marginLeft: 6, cursor: "help" }}
    >
      {meta.icon} {meta.text} · {verification.source}
    </span>
  );
}

function ReferencesPage({ run, setRun, setError, onNavigate, history, openRun }) {
  const [busy, setBusy] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const allRuns = React.useMemo(
    () => history,
    [history],
  );

  async function fetchRefs(merge) {
    if (!run?.run_id) return;
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/api/runs/${run.run_id}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merge ? { merge: true } : {}),
      });
      if (!resp.ok) {
        const detail = await readError(resp);
        throw new Error(detail || "操作失败");
      }
      const data = await resp.json();
      setRun(data);
      if (!data.external_references?.length) {
        setError("未提取到外部论据。Agent 在发言中需要包含“### 外部引用”小节才会被收录。旧 run 可能不支持此功能。");
      } else {
        setError("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyRefs() {
    if (!run?.run_id) return;
    setVerifying(true);
    setError("开始在线核验，逐条请求 arXiv/Crossref/OpenReview…");
    try {
      // POST 启动异步任务（后台串行，每条完成即写回 DB）
      const resp = await fetch(`${API_BASE}/api/runs/${run.run_id}/references/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const detail = await readError(resp);
        throw new Error(detail || "启动核验失败");
      }

      // 轮询进度，每 1.2s 拉一次最新快照（SSE 不适用——核验是后台任务，不走 run 状态流）
      const poll = async () => {
        try {
          const prog = await fetch(`${API_BASE}/api/runs/${run.run_id}/references/verify`).then((r) => r.json());
          const done = prog.done || 0;
          const total = prog.total || 0;
          // 每次拉最新 run 快照，让徽章实时刷新
          const latest = await fetch(`${API_BASE}/api/runs/${run.run_id}`).then((r) => r.json());
          setRun(latest);
          if (prog.status === "running") {
            setError(`核验中… ${done}/${total} 条完成`);
            setTimeout(poll, 1200);
          } else {
            const verified = (latest.external_references || []).filter((r) => r.verification?.status === "verified").length;
            const pending = (latest.external_references || []).filter((r) => ["pending", "not_found", "mismatch"].includes(r.verification?.status)).length;
            setError(`在线核验完成：${verified} 条已核验存在，${pending} 条需人工核实或未找到。`);
            setVerifying(false);
          }
        } catch {
          setError("核验进度轮询失败，可稍后刷新查看结果。");
          setVerifying(false);
        }
      };
      setTimeout(poll, 1200);
    } catch (err) {
      setError(err.message);
      setVerifying(false);
    }
  }

  function buildRefsMD() {
    if (!refs.length) return "";
    const lines = [`# 外部论据清单`, ``, `来源 Run: ${run.run_id}`, `时间: ${new Date(run.created_at).toLocaleString()}`, ``, ``];
    const grouped = {};
    for (const ref of refs) {
      const t = ref.source_type || "other";
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(ref);
    }
    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`## ${typeLabel[type] || type}（${items.length} 条）`);
      lines.push("");
      for (const ref of items) {
        lines.push(`### ${ref.title || "未命名"}${ref.year ? ` (${ref.year})` : ""}`);
        if (ref.authors) lines.push(`- **作者**：${ref.authors}`);
        if (ref.url && ref.url !== "待确认") lines.push(`- **链接**：${ref.url}`);
        if (ref.cited_viewpoint) {
          const vp = ref.cited_viewpoint.replace(/^[\s]*支撑观点[：:]/, "").trim();
          if (vp) lines.push(`- **支撑观点**：${vp}`);
        }
        lines.push(`- **引用阶段**：${ref.citing_agent || ""} · 第 ${ref.round || "?"} 轮`);
        lines.push("");
      }
    }
    return lines.join("\n");
  }

  const refs = run?.external_references || [];
  const typeLabel = { paper: "论文", blog: "博客", dataset: "数据集", book: "书籍", other: "其他" };

  const grouped = React.useMemo(() => {
    const groups = {};
    for (const ref of refs) {
      const t = ref.source_type || "other";
      if (!groups[t]) groups[t] = [];
      groups[t].push(ref);
    }
    return groups;
  }, [refs]);

  return (
    <div className="refs-layout">
      {/* 左侧：历史记录列表 */}
      <div className="panel refs-sidebar">
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>历史讨论</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{allRuns.length} 条记录</div>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          {allRuns.length === 0 ? (
            <div style={{ padding: "16px", fontSize: 13, color: "var(--muted)" }}>暂无讨论记录</div>
          ) : allRuns.map((item) => (
            <button
              key={item.run_id}
              onClick={() => openRun(item.run_id)}
              style={{
                display: "block",
                width: "100%",
                border: "none",
                borderBottom: "1px solid var(--border)",
                background: run?.run_id === item.run_id ? "var(--accent-soft)" : "transparent",
                borderLeft: run?.run_id === item.run_id ? "4px solid var(--accent)" : "4px solid transparent",
                padding: "12px 14px",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (run?.run_id !== item.run_id) e.currentTarget.style.background = "var(--panel-muted)"; }}
              onMouseLeave={(e) => { if (run?.run_id !== item.run_id) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4, marginBottom: 4 }}>{item.run_name || item.field}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span className={`status-badge ${statusBadgeClass(item.status)}`} style={{ fontSize: 10 }}>
                  {item.status}
                </span>
                {item.mode && item.mode !== "full" ? (
                  <span className="status-badge pending" style={{ fontSize: 10 }}>
                    {{focused: "聚焦", quick: "快速", memory: "记忆"}[item.mode] || item.mode}
                  </span>
                ) : null}
                {item.source_run_id ? (
                  <span className="status-badge pending" style={{ fontSize: 10, background: "rgba(111,124,255,0.1)", color: "#6a79d6" }}>
                    源 {item.source_run_id.slice(0, 8)}
                  </span>
                ) : null}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右侧：论据内容 */}
      <div className="panel refs-content">
        <div className="pane-heading">
          <div>
            <h2>外部论据清单</h2>
            <p>讨论过程中各 Agent 引用的外部论文、博客、数据集等论据。</p>
          </div>
          {run ? (
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <button className="icon-button" disabled={busy} onClick={() => fetchRefs(false)} style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 32 }}>
                <RefreshCw size={14} className={busy ? "spin" : ""} />
                <span>重新提取</span>
              </button>
              <button className="icon-button" disabled={busy} onClick={() => fetchRefs(true)} style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 32 }}>
                <span>+ 更新论据</span>
              </button>
              <button
                className="icon-button"
                disabled={verifying || !refs.length}
                onClick={verifyRefs}
                style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 32, background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-strong)" }}
                title="对 arXiv/Crossref/OpenReview 在线核验引用真实性"
              >
                <ShieldCheck size={14} className={verifying ? "spin" : ""} />
                <span>{verifying ? "核验中…" : "在线核验"}</span>
              </button>
              <DownloadMenu label="导出" disabled={!refs.length} mdContent={buildRefsMD()} pdfContent={buildRefsMD()} pdfTitle={`K-Storm 外部论据 ${run?.run_id || ""}`} />
            </div>
          ) : null}
        </div>

        {!run ? (
          <div className="empty-state">
            <BookOpen size={28} />
            <span>从左侧选择一条历史讨论，或先启动一次讨论。</span>
          </div>
        ) : refs.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={28} />
            <span>本次讨论暂无外部论据。Agent 在发言中引用了外部论文、博客等资料时会自动收录。</span>
            <button className="icon-button" disabled={busy} onClick={() => fetchRefs(false)} style={{ marginTop: 8 }}>
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              重新提取
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>共 {refs.length} 条外部论据</div>
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-badge pending">{typeLabel[type] || type}</span>
                  {items.length} 条
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((ref) => {
                    const vp = ref.cited_viewpoint ? ref.cited_viewpoint.replace(/^[\s]*支撑观点[：:]/, "").trim() : "";
                    const titleLine = ref.url && ref.url !== "待确认" ? `[${ref.title || "未命名"}](${ref.url})` : (ref.title || "未命名");
                    const md = [
                      `**${titleLine}${ref.year ? ` (${ref.year})` : ""}**`,
                      ref.authors ? `**作者**：${ref.authors}` : null,
                      vp ? `**支撑观点**：${vp}` : null,
                      `*引用阶段：${ref.citing_agent || ""} · 第 ${ref.round || "?"} 轮*`,
                    ].filter(Boolean).join("\n\n");
                    return (
                      <div key={ref.id} style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <div
                            className="markdown-rendered"
                            style={{ fontSize: 13, lineHeight: 1.6, flex: 1, minWidth: 0 }}
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }}
                          />
                          <VerifyBadge verification={ref.verification} />
                        </div>
                        {ref.verification?.matched_title && ref.verification.status !== "skipped" ? (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 600 }}>核验匹配：</span>{ref.verification.matched_title}
                            {ref.verification.matched_authors ? ` · ${ref.verification.matched_authors}` : ""}
                            {ref.verification.matched_year ? ` (${ref.verification.matched_year})` : ""}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferencesPage;
