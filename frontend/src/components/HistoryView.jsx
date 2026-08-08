import React from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { ACTIVE_RUN_STATES, statusBadgeClass } from "../lib/constants.js";
import { downloadMarkdown, reportFilename } from "../lib/download.js";

function HistoryView({
  history,
  location,
  selected,
  setSelected,
  onDelete,
  onLocation,
  onOpen,
  onRerunRun,
  onDownloadReportRun,
  onDownloadJsonRun,
  onDownloadBundleRun,
  onConfirmRerunRun,
  onExportPDF,
  loading,
}) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  function toggle(runId, checked) {
    setSelected((current) =>
      checked ? [...new Set([...current, runId])] : current.filter((id) => id !== runId),
    );
  }

  const filtered = React.useMemo(() => {
    let list = history;
    if (statusFilter !== "all") {
      if (statusFilter === "RUNNING") {
        // 后端的“运行中”实际是 CREATED/TEMPLATE_VALIDATED/各 *_RUNNING 细分状态，
        // 这里统一归一为“运行中”筛选。
        list = list.filter((h) => ACTIVE_RUN_STATES.includes(h.status));
      } else {
        list = list.filter((h) => h.status === statusFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (h) =>
          (h.field || "").toLowerCase().includes(q) ||
          (h.run_id || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [history, statusFilter, searchQuery]);

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>历史记录</h2>
          <p>本地 SQLite 保存最近运行。</p>
        </div>
        <button className="icon-button" onClick={onLocation}>
          <History size={18} />
          <span>位置</span>
        </button>
      </div>
      <div className="history-toolbar">
        <button className="danger-button" disabled={!selected.length} onClick={onDelete}>
          删除所选
        </button>
      </div>
      <div className="history-filter-bar">
        <input
          type="text"
          placeholder="搜索领域或 Run ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="COMPLETED">已完成</option>
          <option value="FAILED">失败</option>
          <option value="RUNNING">运行中</option>
        </select>
        <span className="history-count">{filtered.length} / {history.length} 条</span>
      </div>
      {location ? <div className="history-location">{location}</div> : null}
      {filtered.length ? (
        <div className="history-list">
          {filtered.map((item) => {
            const isFailed = item.status === "FAILED";
            const isCompleted = item.status === "COMPLETED";
            const canExport = isCompleted;
            return (
              <div
                className="history-item"
                key={item.run_id}
              >
                <input
                  checked={selected.includes(item.run_id)}
                  type="checkbox"
                  onChange={(event) => toggle(item.run_id, event.target.checked)}
                />
                <button className="history-open" onClick={() => onOpen(item.run_id)}>
                  <span>{item.run_name || item.field}</span>
                  <small>
                    {item.mode && item.mode !== "full" ? (
                      <span className="status-badge pending" style={{marginRight: 4}}>
                        {{focused: "聚焦", quick: "快速", memory: "记忆"}[item.mode] || item.mode}
                      </span>
                    ) : null}
                    {item.research_stage && item.research_stage !== "auto" ? (
                      <span className="status-badge pending" style={{marginRight: 4, background: "rgba(47,157,137,0.1)", color: "#2f9d89"}}>
                        {{topic_exploration: "选题", plan_refinement: "方案", result_diagnosis: "诊断", pivot_evaluation: "转向"}[item.research_stage] || item.research_stage}
                      </span>
                    ) : null}
                    {item.source_run_id ? (
                      <span className="status-badge pending" style={{marginRight: 4, background: "rgba(111,124,255,0.1)", color: "#6a79d6"}}>
                        源 {item.source_run_id.slice(0, 8)}
                      </span>
                    ) : null}
                    <span className={`status-badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                    {item.duration_seconds ? (
                      <span className="status-badge pending" style={{ marginLeft: 4 }}>
                        {item.duration_seconds >= 60 ? `${Math.round(item.duration_seconds / 60)} 分钟` : `${item.duration_seconds} 秒`}
                      </span>
                    ) : null}
                    {item.llm_calls ? (
                      <span className="status-badge pending" style={{ marginLeft: 4 }}>
                        {item.llm_calls} 次调用
                      </span>
                    ) : null}
                    {" \u00b7 "}{new Date(item.created_at).toLocaleString()}
                  </small>
                </button>
                <div className="history-actions-inline">
                  {isFailed ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={async () => {
                        const opened = await onOpen(item.run_id);
                        if (opened) await onRerunRun(opened);
                      }}
                    >
                      {item.status === "FAILED" ? "继续分析" : "重新分析"}
                    </button>
                  ) : null}
                  {isCompleted ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={async () => {
                        const opened = await onOpen(item.run_id);
                        if (!opened) return;
                        if (!opened.final_report) return;
                        downloadMarkdown(opened.final_report, reportFilename(opened));
                      }}
                    >
                      <Download size={14} />
                      <span>报告</span>
                    </button>
                  ) : null}
                  {isCompleted ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={async () => {
                        const opened = await onOpen(item.run_id);
                        if (!opened) return;
                        onExportPDF(opened.final_report, reportFilename(opened));
                      }}
                    >
                      <Download size={14} />
                      <span>PDF</span>
                    </button>
                  ) : null}
                  {isCompleted ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={() => {
                        if (window.confirm("当前记录为 COMPLETED 状态，确认重新分析？")) {
                          onConfirmRerunRun(item);
                        }
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>重新分析</span>
                    </button>
                  ) : null}
                  {canExport ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={async () => {
                        const opened = await onOpen(item.run_id);
                        if (opened) await onDownloadBundleRun(opened);
                      }}
                    >
                      <Download size={14} />
                      <span>打包</span>
                    </button>
                  ) : null}
                  {canExport ? (
                    <button
                      className="icon-button copy-mini"
                      disabled={loading}
                      onClick={async () => {
                        const opened = await onOpen(item.run_id);
                        if (opened) await onDownloadJsonRun(opened);
                      }}
                    >
                      <span>JSON</span>
                    </button>
                  ) : null}
                  <small>{item.run_id}</small>
                </div>
              </div>
            );
          })}
        </div>
      ) : history.length ? (
        <div className="empty-line">没有匹配“{searchQuery}”的记录。</div>
      ) : (
        <div className="empty-line">暂无历史记录。</div>
      )}
    </section>
  );
}

export default HistoryView;
