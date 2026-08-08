import React from "react";
import { FileUp, LoaderCircle, Play } from "lucide-react";
import { COMPETITION_DEMOS, SCENE_TEMPLATES, formFields, formatChars, requiredFields } from "../lib/constants.js";

function TemplatePanel({
  template,
  setTemplate,
  completion,
  canSubmit,
  loading,
  documents,
  addDocuments,
  updateDocument,
  removeDocument,
  onSubmit,
  onOpenRun,
  mode = "full",
  runName = "",
  setRunName,
}) {
  const [selectedScene, setSelectedScene] = React.useState("");
  const submitLabel = mode === "quick" ? "快速探测" : mode === "memory" ? "查询记忆" : mode === "focused" ? "启动专题研讨" : "开始分析";

  function applyTemplatePreset(preset, sceneId = "") {
    setTemplate((current) => ({ ...current, ...preset.template }));
    setSelectedScene(sceneId);
    if (preset.runName && setRunName) {
      setRunName(preset.runName);
    }
  }

  function handleDemoClick(demo) {
    // 预置演示 run：一键打开完整讨论结果（断网可用，零模型调用）
    if (demo.runId && onOpenRun) {
      onOpenRun(demo.runId);
      return;
    }
    applyTemplatePreset(demo, demo.id);
  }

  return (
    <div className="panel template-panel" style={{ display: "grid", gap: 0, overflow: "auto" }}>
      <div className="pane-heading">
        <div>
          <h2>{{full: "头脑风暴", focused: "头脑风暴聚焦版", quick: "头脑风暴快速版"}[mode] || "头脑风暴"}</h2>
          <p>{{full: "完整选题讨论，适合开题方向探索、多方案对比评估、多视角交叉验证的复杂问题。", focused: "精选关键 Agent 定向讨论，适合验证单一方向、深挖机制假设或评估可行性。", quick: "单 Agent 快速问答，适合初步判断一个想法是否值得深入。"}[mode] || ""}</p>
        </div>
        <div
          className="completion"
          aria-label={`模板完成度 ${completion}%`}
          style={{ "--progress": `${completion}%` }}
        >
          <span>{completion}%</span>
        </div>
      </div>

      <div className="demo-mode-card">
        <div className="demo-mode-head">
          <div>
            <strong>参赛演示模式</strong>
            <span>内置高质量案例，适合录制视频和现场快速展示。</span>
          </div>
        </div>
        <div className="demo-case-grid">
          {COMPETITION_DEMOS.map((demo) => (
            <button
              key={demo.id}
              className={`demo-case-button${demo.runId ? " demo-case-run" : ""}`}
              onClick={() => handleDemoClick(demo)}
              title={demo.runId ? "一键打开预置完整演示（含讨论链/IR/批判/报告）" : "填入模板后启动讨论"}
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      {/* 场景预置模板 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)", whiteSpace: "nowrap" }}>场景模板</span>
        <select
          style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--panel-strong)", color: "var(--ink)", cursor: "pointer" }}
          value={selectedScene}
          onChange={(event) => {
            const found = SCENE_TEMPLATES.find((t) => t.id === event.target.value);
            if (found) {
              applyTemplatePreset(found, event.target.value);
            }
          }}
        >
          <option value="">选择预置场景，一键填入示例内容...</option>
          {SCENE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>填入后可直接编辑</span>
      </div>

      <label className="field" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>讨论名称（选填，留空则用研究领域）</span>
        <input
          type="text"
          value={runName}
          placeholder="如：组会预演-单细胞结果诊断"
          onChange={(event) => setRunName(event.target.value)}
          style={{ fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--panel-bg)" }}
        />
      </label>

      <div className="form-grid">
        {(() => {
          const topRowKeys = ["field", "background", "existing_basis"];
          const rightColKeys = ["core_question", "platforms", "constraints"];
          const bottomRowKeys = ["extension_points", "target_output", "preferred_direction", "avoid_direction"];
          const filtered = formFields.filter(([key]) => {
            if (mode === "quick") return ["field", "background", "existing_basis", "core_question"].includes(key);
            if (mode === "focused") return ["field", "background", "existing_basis", "core_question", "platforms", "constraints"].includes(key);
            return true;
          });
          const topFields = filtered.filter(([key]) => topRowKeys.includes(key));
          const rightFields = filtered.filter(([key]) => rightColKeys.includes(key));
          const bottomFields = filtered.filter(([key]) => bottomRowKeys.includes(key));
          const fieldFn = (key, label, placeholder, rows) => (
            <label className="field" key={key}>
              <span>
                {label}
                {requiredFields.includes(key) ? <b>*</b> : null}
              </span>
              <textarea
                rows={rows}
                value={template[key]}
                placeholder={placeholder}
                onChange={(event) =>
                  setTemplate((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          );
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {/* 上排：前3个是大框（跨3行高度），textarea 自动撑满） */}
              {topFields.map(([key, label, placeholder]) => (
                <div key={key} style={{ gridRow: "span 3", display: "flex", flexDirection: "column" }}>
                  <label className="field" style={{ display: "flex", flexDirection: "column", flex: 1, gap: 7 }}>
                    <span>
                      {formFields.find(([k]) => k === key)?.[1] || key}
                      {requiredFields.includes(key) ? <b>*</b> : null}
                    </span>
                    <textarea
                      value={template[key]}
                      placeholder={placeholder}
                      onChange={(event) =>
                        setTemplate((current) => ({ ...current, [key]: event.target.value }))
                      }
                      style={{ flex: 1, minHeight: 0, resize: "none" }}
                    />
                  </label>
                </div>
              ))}
              {rightFields.map(([key, label, placeholder]) => (
                <div key={key}>
                  {fieldFn(key, label, placeholder, 2)}
                </div>
              ))}
              {/* 下排：4个横排一行 */}
              {bottomFields.map(([key, label, placeholder]) => (
                <div key={key} style={{ gridColumn: "span 1" }}>
                  {fieldFn(key, label, placeholder, 2)}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <section className="document-upload">
        <div>
          <h3>上传文档</h3>
          <p>支持 PDF、Word（docx）、TXT、Markdown 等格式，可添加注释供 Agent 参考。</p>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "7px 16px", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, color: "var(--accent-strong)" }}>
          <FileUp size={15} /> 选择文件（PDF / DOCX / TXT / MD）
          <input
            multiple
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              addDocuments(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
        </label>
        <div className="document-list">
          {documents.length ? (
            documents.map((document) => {
              const ext = (document.name.split(".").pop() || "").toUpperCase();
              const extColor = { PDF: "#dc2626", DOCX: "#2563eb", DOC: "#2563eb", MD: "#7c3aed", TXT: "#4b5563" }[ext] || "#4b5563";
              return (
              <div className="document-item" key={document.id}>
                <div className="document-row">
                  <strong style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", background: extColor, color: "#fff", borderRadius: 4, letterSpacing: "0.04em" }}>{ext}</span>
                    {document.name}
                    <small>{formatChars(document.content?.length || 0)} 字符</small>
                  </strong>
                  <button
                    className="danger-button"
                    onClick={() => removeDocument(document.id)}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={document.note}
                  placeholder="为该文档添加注释（可选）"
                  onChange={(event) =>
                    updateDocument(document.id, { note: event.target.value })
                  }
                />
                {document.summary ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                    <strong>提取信息：</strong>{document.summary}
                  </div>
                ) : null}
              </div>
              );
            })
          ) : (
            <div className="empty-line">还没有上传文档。</div>
          )}
        </div>
      </section>

      <button
        className="primary-action"
        disabled={!canSubmit || loading}
        onClick={onSubmit}
      >
        {loading ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
        {loading ? "分析中" : submitLabel}
      </button>
    </div>
  );
}

export default TemplatePanel;
