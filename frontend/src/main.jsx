import React from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowUpCircle,
  BookOpen,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  FileUp,
  FlaskConical,
  History,
  LoaderCircle,
  Maximize2,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import "./styles/app.css";
import {
  downloadJsonFile,
  downloadMarkdown,
  downloadRunBundle,
  openPdfPrintWindow,
  reportFilename,
  runJsonFilename,
  buildBundleMD,
} from "./lib/download.js";
import { highlightKeyword, markdownToHtml } from "./lib/markdown.js";
import {
  ACTIVE_RUN_STATES,
  API_BASE,
  PERSPECTIVES,
  agentKeyFromDisplay,
  briefText,
  emptyTemplate,
  inferDocumentType,
  inferParallelFirstRound,
  inferRunRounds,
  loadModelSettings,
  normalizeLoadedDocuments,
  readError,
  requiredFields,
  statusBadgeClass,
} from "./lib/constants.js";
import ModeSelector from "./components/ModeSelector.jsx";
import TemplatePanel from "./components/TemplatePanel.jsx";
import MemoryQueryPanel from "./components/MemoryQueryPanel.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ReferencesPage from "./components/ReferencesPage.jsx";
import HistoryView from "./components/HistoryView.jsx";
import DownloadMenu from "./components/DownloadMenu.jsx";


// 后端 KNOWN_MODEL_PRESETS 对应的预置供应商：读取模型会返回完整预置列表，可直接写入 provider.models


function App() {
  const [template, setTemplate] = React.useState({
    ...emptyTemplate,
    field: "肿瘤免疫与单细胞测序",
    background:
      "课题组关注免疫治疗耐药，希望从肿瘤微环境细胞互作中找到新的机制切入点。",
    existing_basis:
      "已有一批治疗前后样本的单细胞数据，观察到某类髓系细胞亚群在耐药样本中升高，并伴随 T 细胞耗竭评分上升。",
    platforms:
      "单细胞转录组、流式细胞术、细胞共培养、免疫组化、小鼠皮下瘤模型",
    constraints: "3 个月内完成预实验; 样本量有限; 动物实验名额有限",
    target_output: "开题报告和组会讨论材料",
    preferred_direction: "机制研究、转化标志物",
  });
  const [run, setRun] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [selectedHistory, setSelectedHistory] = React.useState([]);
  const [historyLocation, setHistoryLocation] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [modelSettings, setModelSettings] = React.useState(loadModelSettings);
  const [rounds, setRounds] = React.useState(3);
  const [runName, setRunName] = React.useState("");
  const [activeRounds, setActiveRounds] = React.useState(3);
  const [parallelFirstRound, setParallelFirstRound] = React.useState(false);
  const [documents, setDocuments] = React.useState([]);
  const pollRef = React.useRef(null);
  const sseRef = React.useRef(null);
  const tokenStreamRef = React.useRef(null);
  const [streamingPartial, setStreamingPartial] = React.useState(null);
  // streamingPartial: { partial: "", agent: "", step_type: "", round: 0 } | null

  React.useEffect(() => {
    loadHistory();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      if (tokenStreamRef.current) { tokenStreamRef.current.close(); tokenStreamRef.current = null; }
    };
  }, []);

  const completion = Math.round(
    (requiredFields.filter((field) => template[field].trim()).length /
      requiredFields.length) *
      100,
  );
  const canSubmit = requiredFields.every((field) => template[field].trim());

  async function loadHistory() {
    try {
      const response = await fetch(`${API_BASE}/api/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
        setSelectedHistory((current) =>
          current.filter((runId) => data.some((item) => item.run_id === runId)),
        );
      }
    } catch {
      setHistory([]);
    }
  }

  React.useEffect(() => {
    localStorage.setItem("ks-model-settings-react", JSON.stringify(modelSettings));
  }, [modelSettings]);

  async function addDocuments(files) {
    const BINARY_EXTS = new Set(["pdf", "docx", "doc"]);
    const isBinary = (name) => BINARY_EXTS.has((name.split(".").pop() || "").toLowerCase());

    // Split into text files (read locally) and binary files (extract via backend)
    const textFiles = files.filter((f) => !isBinary(f.name));
    const binaryFiles = files.filter((f) => isBinary(f.name));

    const nextDocuments = [];

    // Local text files
    for (const file of textFiles) {
      nextDocuments.push({
        id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        doc_type: inferDocumentType(file.name),
        content: await file.text(),
        note: "",
        summary: "",
      });
    }

    // Binary files: POST to /api/documents/extract
    if (binaryFiles.length > 0) {
      const form = new FormData();
      for (const file of binaryFiles) form.append("files", file);
      try {
        const resp = await fetch(`${API_BASE}/api/documents/extract`, { method: "POST", body: form });
        if (!resp.ok) throw new Error(`提取失败 ${resp.status}`);
        const { results } = await resp.json();
        const failedNames = [];
        for (const r of results) {
          if (r.error) {
            failedNames.push(r.name);
            nextDocuments.push({
              id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: r.name,
              doc_type: inferDocumentType(r.name),
              content: "",
              note: "",
              summary: `⚠️ 提取失败：${r.error}`,
            });
          } else {
            nextDocuments.push({
              id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: r.name,
              doc_type: inferDocumentType(r.name),
              content: r.text,
              note: "",
              summary: "",
            });
          }
        }
        if (failedNames.length) {
          setError(`${failedNames.length} 个文件提取失败：${failedNames.join("、")}。可在文件卡片中查看原因，或检查后端依赖。`);
        }
      } catch (err) {
        setError(`文档提取出错：${err.message}`);
      }
    }

    setDocuments((current) => [...current, ...nextDocuments]);
  }

  function updateDocument(id, patch) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, ...patch } : document,
      ),
    );
  }

  function removeDocument(id) {
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  async function createRun(
    templateOverride = template,
    options = {},
  ) {
    const payloadRounds = options.rounds ?? (Number.parseInt(rounds, 10) || 3);
    const payloadParallelFirstRound = options.parallelFirstRound ?? parallelFirstRound;
    const payloadDocuments = options.documents ?? documents;
    const payloadModelSettings = options.modelSettings ?? modelSettings;
    const normalizedDocuments = normalizeLoadedDocuments(payloadDocuments);
    const ready = requiredFields.every((field) => templateOverride[field]?.trim());
    if (!ready || loading) return;
    // 校验：已分配模型但对应供应商缺 API Key → 阻止提交并提示（避免运行中途失败）
    const missingKeyProviders = (payloadModelSettings.providers || []).filter(
      (provider) =>
        !provider.api_key &&
        Object.values(payloadModelSettings.assignments || {}).some(
          (ref) => ref && ref.startsWith(`${provider.id}:`),
        ),
    );
    if (missingKeyProviders.length) {
      setError(`已分配模型但「${missingKeyProviders.map((p) => p.name).join("、")}」未填写 API Key，无法调用真实模型。请在模型设置中填写 API Key，或清空模型分配以使用本地 Mock。`);
      return;
    }
    setLoading(true);
    setError("");
    setCopied(false);
    setActiveRounds(payloadRounds);
    setRounds(payloadRounds);
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_input: templateOverride,
          research_stage: options.researchStage || researchStage,
          mode: options.overrideMode || discussionMode,
          rounds: (options.overrideMode === "focused" || discussionMode === "focused") ? Math.min(payloadRounds, 2) : payloadRounds,
          parallel_first_round: payloadParallelFirstRound,
          selected_agents: (options.overrideMode === "focused" || discussionMode === "focused") ? (options.selectedAgents || selectedAgents) : [],
          probe_agent: discussionMode === "quick" ? probeAgent : "",
          probe_question: discussionMode === "quick" ? probeQuestion : "",
          source_run_id: options.sourceRunId || "",
          run_name: options.runName || runName || "",
          documents: normalizedDocuments,
          model_settings: payloadModelSettings,
        }),
      });
      if (!response.ok) {
        const detail = await readError(response);
        throw new Error(detail || "运行失败");
      }
      const data = await response.json();
      setRun(data);
      setRunName(data.run_name || "");
      setTemplate({ ...emptyTemplate, ...(data.template_input || templateOverride) });
      setDocuments(normalizedDocuments);
      setParallelFirstRound(payloadParallelFirstRound);
      startPolling(data.run_id);
      await loadHistory();
    } catch (err) {
      setError(err.message || "运行失败，请检查后端服务是否启动。");
      setLoading(false);
    }
  }

  async function handleUpgrade(sourceRun, targetMode) {
    if (loading || !sourceRun) return;
    const modeLabel = targetMode === "focused" ? "聚焦研讨" : "完整讨论";
    const defaultRounds = targetMode === "focused" ? 2 : 3;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const resp = await fetch(`${API_BASE}/api/runs/${sourceRun.run_id}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_mode: targetMode,
          rounds: defaultRounds,
          selected_agents: targetMode === "focused" ? (selectedAgents.length ? selectedAgents : ["novelty", "reviewer"]) : [],
          model_settings: modelSettings,
        }),
      });
      if (!resp.ok) {
        const detail = await readError(resp);
        throw new Error(detail || "升级失败");
      }
      const data = await resp.json();
      setRun(data);
      setRunName(data.run_name || "");
      setDiscussionMode(targetMode);
      setActiveRounds(defaultRounds);
      setRounds(defaultRounds);
      startPolling(data.run_id);
      await loadHistory();
    } catch (err) {
      setError(err.message || `升级为${modeLabel}失败`);
      setLoading(false);
    }
  }

  function _startPolling(runId) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let consecutiveErrors = 0;
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/runs/${runId}`);
        if (!response.ok) throw new Error(await readError(response));
        const data = await response.json();
        consecutiveErrors = 0;
        setRun(data);
        if (["COMPLETED", "FAILED", "CANCELED"].includes(data.status)) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          // 修复：终态必须清空 streamingPartial，避免残留"生成中"幻影卡
          setStreamingPartial(null);
          loadHistory();
        }
      } catch (err) {
        // 修复：瞬时网络错误不终止轮询（原实现一次失败即永久停止）；
        // 连续失败 5 次才停止并提示，避免断网后进度永远冻结
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          setError(err.message || "读取进度失败");
        }
      }
    }, 900);
  }

  function _startTokenStream(runId) {
    if (tokenStreamRef.current) { tokenStreamRef.current.close(); tokenStreamRef.current = null; }
    setStreamingPartial(null);
    if (typeof EventSource === "undefined") return;

    const tsse = new EventSource(`${API_BASE}/api/runs/${runId}/token-stream`);
    tokenStreamRef.current = tsse;

    tsse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.done) {
          tsse.close(); tokenStreamRef.current = null;
          setStreamingPartial(null);
          return;
        }
        if (data.partial) {
          setStreamingPartial({ partial: data.partial, agent: data.agent || "", step_type: data.step_type || "debate", round: data.round || 0 });
        } else {
          setStreamingPartial(null);
        }
      } catch { /* 忽略 */ }
    };

    tsse.onerror = () => {
      tsse.close(); tokenStreamRef.current = null;
    };
  }

  function startPolling(runId) {
    // 优先使用 SSE，不支持时降级为轮询
    if (typeof EventSource === "undefined") {
      _startPolling(runId);
      return;
    }
    // 关闭旧连接
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }

    // 同时开启 token 流 SSE
    _startTokenStream(runId);

    const sse = new EventSource(`${API_BASE}/api/runs/${runId}/stream`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          sse.close(); sseRef.current = null;
          if (data.error === "not_found") {
            setLoading(false);
            setError("运行记录不存在，请返回历史记录重新打开。");
          } else {
            _startPolling(runId);
          }
          return;
        }
        setRun(data);
        if (["COMPLETED", "FAILED", "CANCELED"].includes(data.status)) {
          sse.close(); sseRef.current = null;
          setLoading(false);
          setStreamingPartial(null);
          loadHistory();
        }
      } catch {
        // 忽略解析错误
      }
    };

    sse.onerror = () => {
      // SSE 断开时降级为轮询
      sse.close(); sseRef.current = null;
      _startPolling(runId);
    };
  }

  async function fetchRun(runId) {
    const response = await fetch(`${API_BASE}/api/runs/${runId}`);
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  }

  async function openRun(runId) {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    // 修复：旧 run 的 token 流连接必须一并关闭，否则会继续 setStreamingPartial 泄漏
    if (tokenStreamRef.current) {
      tokenStreamRef.current.close();
      tokenStreamRef.current = null;
    }
    setStreamingPartial(null);
    setLoading(true);
    setError("");
    let loadedData = null;
    try {
      const data = await fetchRun(runId);
      loadedData = data;
      setRun(data);
      setTemplate({ ...emptyTemplate, ...(data.template_input || {}) });
      setDocuments(normalizeLoadedDocuments(data.documents || []));
      setParallelFirstRound(inferParallelFirstRound(data));
      setRounds(inferRunRounds(data));
      setActiveRounds(inferRunRounds(data));
      // 如果 run 仍在运行，启动 polling 并保持 loading
      if (ACTIVE_RUN_STATES.includes(data.status)) {
        startPolling(data.run_id);
        return data;
      }
      return data;
    } catch (err) {
      setError(err.message || "无法打开历史记录");
      return null;
    } finally {
      // 只有非运行状态才结束 loading
      if (!loadedData || !ACTIVE_RUN_STATES.includes(loadedData.status)) {
        setLoading(false);
      }
    }
  }

  async function rerunFromRun(sourceRun) {
    if (!sourceRun) return;
    if (sourceRun.status === "FAILED" || sourceRun.status === "CANCELED") {
      // Resume from failure point
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/api/runs/${sourceRun.run_id}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rounds: inferRunRounds(sourceRun),
            parallel_first_round: inferParallelFirstRound(sourceRun),
            model_settings: modelSettings,
          }),
        });
        if (!response.ok) {
          const detail = await readError(response);
          throw new Error(detail || "继续失败");
        }
        const data = await response.json();
        setRun(data);
        setActiveRounds(inferRunRounds(sourceRun));
        startPolling(data.run_id);
      } catch (err) {
        setError(err.message || "继续失败");
        setLoading(false);
      }
    } else {
      // Rerun from scratch
      await createRun(sourceRun.template_input, {
        rounds: inferRunRounds(sourceRun),
        parallelFirstRound: inferParallelFirstRound(sourceRun),
        documents: sourceRun.documents || [],
        modelSettings,
      });
    }
  }

  async function rerunCurrent() {
    if (!run) return;
    await rerunFromRun(run);
  }

  async function confirmRerunAndEdit(sourceItem) {
    // 先加载完整 run 数据
    const fullRun = await fetchRun(sourceItem.run_id);
    if (!fullRun?.template_input) return;
    // 预填模板并跳转到新建讨论页
    setTemplate({ ...emptyTemplate, ...fullRun.template_input });
    if (fullRun.mode) setDiscussionMode(fullRun.mode);
    if (fullRun.research_stage) setResearchStage(fullRun.research_stage);
    if (fullRun.selected_agents?.length) setSelectedAgents(fullRun.selected_agents);
    setRounds(inferRunRounds(fullRun));
    setParallelFirstRound(inferParallelFirstRound(fullRun));
    setActivePage("create");
  }

  async function cancelCurrent() {
    if (!run?.run_id || !loading) return;
    try {
      const response = await fetch(`${API_BASE}/api/runs/${run.run_id}/cancel`, { method: "POST" });
      if (!response.ok) {
        const detail = await readError(response);
        throw new Error(detail || "停止失败");
      }
      const data = await response.json();
      setRun(data);
      setLoading(false);
    } catch (err) {
      setError(err.message || "停止失败");
    }
  }

  async function downloadRunReport(sourceRun) {
    if (!sourceRun?.final_report) return;
    downloadMarkdown(sourceRun.final_report, reportFilename(sourceRun));
  }

  async function downloadRunJson(sourceRun) {
    if (!sourceRun) return;
    downloadJsonFile(sourceRun, runJsonFilename(sourceRun));
  }

  async function downloadRunBundleFile(sourceRun) {
    if (!sourceRun?.final_report && !sourceRun?.group_summary && !sourceRun?.debate_messages?.length) return;
    downloadRunBundle(sourceRun);
  }

  async function downloadCurrentReport() {
    if (!run?.final_report) return;
    await downloadRunReport(run);
  }

  async function downloadCurrentJson() {
    if (!run) return;
    await downloadRunJson(run);
  }

  async function downloadCurrentBundle() {
    if (!run?.final_report && !run?.group_summary) return;
    await downloadRunBundleFile(run);
  }

  function exportPDF(content, title) {
    openPdfPrintWindow(content, title);
  }

  async function copyReport() {
    if (!run?.final_report) return;
    await navigator.clipboard.writeText(run.final_report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function deleteSelectedHistory() {
    if (!selectedHistory.length) {
      setError("请先勾选要删除的历史记录。");
      return;
    }
    setError("");
    const response = await fetch(`${API_BASE}/api/history/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_ids: selectedHistory }),
    });
    if (!response.ok) throw new Error(await readError(response));
    if (run && selectedHistory.includes(run.run_id)) setRun(null);
    setSelectedHistory([]);
    await loadHistory();
  }

  async function showHistoryLocation() {
    setError("");
    const response = await fetch(`${API_BASE}/api/history/location`);
    if (!response.ok) throw new Error(await readError(response));
    const location = await response.json();
    setHistoryLocation(`历史记录文件夹：${location.folder}`);
  }

  // ── V2 页面路由 ──
  const [activePage, setActivePage] = React.useState("overview");
    const [discussionMode, setDiscussionMode] = React.useState("full");
    const [researchStage, setResearchStage] = React.useState("auto");
    const [selectedAgents, setSelectedAgents] = React.useState(["novelty", "mechanism"]);
  const [probeAgent, setProbeAgent] = React.useState("reviewer");
  const [probeQuestion, setProbeQuestion] = React.useState("");
  const navItems = [
    ["overview", "总览", Sparkles],
    ["create", "新建讨论", Play],
    ["debate", "讨论台", Brain],
    ["report", "报告", Clipboard],
    ["refs", "外部论据", BookOpen],
    ["history", "历史", History],
  ];

  async function handleCreateAndGo(options = {}) {
    await createRun(options.templateOverride || undefined, options);
    setActivePage("debate");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span className="brand-initial" aria-hidden="true">K</span>
          </div>
          <div>
            <h1>K-Storm</h1>
            <p>科研选题多 Agent 头脑风暴工作流</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
            <span>模型设置</span>
          </button>
          <div className={`status-pill${loading ? " running" : ""}`}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
            {run?.status ?? "READY"}
          </div>
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="error-close" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}

      <section className="workspace">
        <nav className="left-nav">
          {navItems.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${activePage === key ? "active" : ""}`}
              onClick={() => setActivePage(key)}
            >
              <Icon size={18} />
              {label}
              {key === "history" && history.length > 0 ? (
                <span className="nav-badge">{history.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <section className="main-stage">
          <div className={`page ${activePage === "overview" ? "active" : ""}`}>
            <OverviewPage
              run={run}
              history={history}
              loading={loading}
              onPageNavigate={setActivePage}
              onOpenRun={openRun}
            />
          </div>
          <div className={`page ${activePage === "create" ? "active" : ""}`}>
            <div style={{ display: "grid", gap: 20 }}>
              <div className="panel">
                <div className="panel-title">
                  <div>
                    <h2>新建讨论</h2>
                    <p>配置模板参数并选择讨论模式</p>
                  </div>
                </div>
              </div>
              <ModeSelector mode={discussionMode} onChange={setDiscussionMode} researchStage={researchStage} setResearchStage={setResearchStage} selectedAgents={selectedAgents} setSelectedAgents={setSelectedAgents} probeAgent={probeAgent} setProbeAgent={setProbeAgent} probeQuestion={probeQuestion} setProbeQuestion={setProbeQuestion} rounds={rounds} setRounds={setRounds} parallelFirstRound={parallelFirstRound} setParallelFirstRound={setParallelFirstRound} />
              {discussionMode === "memory" ? (
                <MemoryQueryPanel history={history} run={run} setRun={setRun} setError={setError} onStartRun={handleCreateAndGo} />
              ) : (
              <TemplatePanel
                template={template}
                setTemplate={setTemplate}
                completion={completion}
                canSubmit={canSubmit}
                loading={loading}
                documents={documents}
                addDocuments={addDocuments}
                updateDocument={updateDocument}
                removeDocument={removeDocument}
                onSubmit={handleCreateAndGo}
                onOpenRun={(runId) => { openRun(runId); setActivePage("debate"); }}
                mode={discussionMode}
                runName={runName}
                setRunName={setRunName}
              />
              )}
            </div>
          </div>
          <div className={`page ${activePage === "debate" ? "active" : ""}`}>
            <DebatePage
              run={run}
              loading={loading}
              activeRounds={activeRounds}
              onRerun={rerunCurrent}
              onCancel={cancelCurrent}
              onConfirmRerun={confirmRerunAndEdit}
              onUpgrade={handleUpgrade}
              streamingPartial={streamingPartial}
            />
          </div>
          <div className={`page ${activePage === "report" ? "active" : ""}`}>
            <div style={{ display: "grid", gap: 20 }}>
              <div className="panel">
                <div className="panel-title">
                  <div>
                    <h2>报告</h2>
                    <p>查看最终分析报告并导出</p>
                  </div>
                </div>
              </div>
              <ReportView
                run={run}
                copied={copied}
                onCopy={copyReport}
                onDownloadReport={downloadCurrentReport}
                onDownloadJson={downloadCurrentJson}
                onDownloadBundle={downloadCurrentBundle}
                onExportPDF={() => exportPDF(run?.final_report, `K-Storm 报告 ${run?.run_id || ""}`)}
                onNavigate={setActivePage}
              />
              <DirectionPanel run={run} />
            </div>
          </div>
          <div className={`page ${activePage === "refs" ? "active" : ""}`}>
            <ReferencesPage
              run={run}
              setRun={setRun}
              setError={setError}
              onNavigate={setActivePage}
              history={history}
              openRun={(runId) => { openRun(runId); }}
            />
          </div>
          <div className={`page ${activePage === "history" ? "active" : ""}`}>
            <div style={{ display: "grid", gap: 20 }}>
              <div className="panel">
                <div className="panel-title">
                  <div>
                    <h2>历史记录</h2>
                    <p>浏览和管理所有运行记录</p>
                  </div>
                </div>
              </div>
              <HistoryView
              history={history}
              location={historyLocation}
              selected={selectedHistory}
              setSelected={setSelectedHistory}
              onDelete={() =>
                deleteSelectedHistory().catch((err) =>
                  setError(err.message || "删除失败"),
                )
              }
              onLocation={() =>
                showHistoryLocation().catch((err) =>
                  setError(err.message || "读取位置失败"),
                )
              }
              onOpen={async (runId) => {
                const data = await openRun(runId);
                setActivePage("debate");
                return data;
              }}
              onRerunRun={rerunFromRun}
              onDownloadReportRun={downloadRunReport}
              onDownloadJsonRun={downloadRunJson}
              onDownloadBundleRun={downloadRunBundleFile}
              onConfirmRerunRun={confirmRerunAndEdit}
              onExportPDF={(content, title) => exportPDF(content, title)}
              loading={loading}
            />
            </div>
          </div>
        </section>

        <aside className="intel-rail">
          <IntelRail
            run={run}
            loading={loading}
            modelSettings={modelSettings}
            activePage={activePage}
            onNavigate={setActivePage}
            onCopy={copyReport}
            onDownloadReport={downloadCurrentReport}
            onDownloadJson={downloadCurrentJson}
            onDownloadBundle={downloadCurrentBundle}
            onExportPDF={() => exportPDF(run?.final_report, `K-Storm 报告 ${run?.run_id || ""}`)}
          />
        </aside>
      </section>
      {settingsOpen ? (
        <SettingsModal
          settings={modelSettings}
          setSettings={setModelSettings}
          onClose={() => setSettingsOpen(false)}
          setError={setError}
        />
      ) : null}
      {/* 移动端底部导航：≤900px 左导航隐藏，以此替代主流程入口 */}
      <nav className="mobile-bottom-nav" aria-label="移动端导航">
        {navItems.map(([key, label, Icon]) => (
          <button
            key={key}
            className={`nav-item ${activePage === key ? "active" : ""}`}
            onClick={() => setActivePage(key)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}


function OverviewPage({ run, history, loading, onPageNavigate, onOpenRun }) {
  const recent = history.slice(0, 5);
  const totalRuns = history.length;
  const completedRuns = history.filter((h) => h.status === "COMPLETED").length;
  const failedRuns = history.filter((h) => h.status === "FAILED").length;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>总览</h2>
            <p>最近运行与快速入口</p>
          </div>
        </div>
      </div>

      <div className="metric-row" style={{ marginTop: 0 }}>
        <div className="metric">
          <span>总运行数</span>
          <strong>{totalRuns}</strong>
        </div>
        <div className="metric">
          <span>已完成</span>
          <strong>{completedRuns}</strong>
        </div>
        <div className="metric">
          <span>失败</span>
          <strong>{failedRuns}</strong>
        </div>
        <div className="metric">
          <span>当前状态</span>
          <strong>{loading ? "RUNNING" : run?.status ?? "READY"}</strong>
        </div>
      </div>

      <DeliverablesStrip run={run} />

      <div className="panel">
        <div className="panel-title">
          <div>
            <h3>快速入口</h3>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          <button className="primary-action" style={{ width: "auto", marginTop: 0 }} onClick={() => onPageNavigate("create")}>
            <Play size={18} />
            新建讨论
          </button>
          {run ? (
            <button className="icon-button" onClick={() => onPageNavigate("debate")}>
              <Brain size={18} />
              查看当前讨论
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel-auto">
        <div className="panel-title">
          <div>
            <h3>最近讨论</h3>
            <p>{recent.length ? `最近 ${recent.length} 条运行记录` : "暂无历史记录"}</p>
          </div>
          {recent.length ? (
            <button className="icon-button" onClick={() => onPageNavigate("history")}>
              查看全部
            </button>
          ) : null}
        </div>
        {recent.length ? (
          <div className="history-list" style={{ marginTop: 16 }}>
            {recent.map((item) => (
              <button
                key={item.run_id}
                className="history-item recent-history-item"
                onClick={() => onOpenRun(item.run_id)}
                style={{ cursor: "pointer" }}
              >
                <span className="recent-history-title">{item.run_name || item.field}</span>
                <small className="recent-history-meta">{item.status} · {new Date(item.created_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: 16 }}>
            <FlaskConical size={28} />
            <span>还没有运行记录，点击“新建讨论”开始。</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliverablesStrip({ run }) {
  const debateCount = run?.debate_messages?.length ?? 0;
  const documentCount = run?.documents?.length ?? 0;
  const deliverables = [
    ["deliverable_01", "结构化 Briefing", run?.structured_brief ? "ready" : "pending"],
    ["deliverable_02", "多 Agent 讨论链", debateCount ? `${debateCount} msgs` : "pending"],
    ["deliverable_03", "组会提纲 / 风险批判", run?.group_summary ? "generated" : "queued"],
    ["deliverable_04", documentCount ? `证据文件 ${documentCount}` : "报告导出包", run?.final_report ? "ready" : "queued"],
  ];
  return (
    <section className="deliverables-strip" aria-label="K-Storm 输出物状态">
      {deliverables.map(([key, title, state]) => (
        <div className="deliverable-card" key={key}>
          <small>{key}</small>
          <strong>{title}</strong>
          <em>{state}</em>
        </div>
      ))}
    </section>
  );
}

function DebatePage({ run, loading, activeRounds, onRerun, onCancel, onConfirmRerun, onUpgrade, streamingPartial }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <RunOverview run={run} loading={loading} activeRounds={activeRounds} onRerun={onRerun} onCancel={onCancel} onConfirmRerun={onConfirmRerun} onUpgrade={onUpgrade} />
      <DebateView run={run} streamingPartial={streamingPartial} />
    </div>
  );
}

/* ── Perspective Coverage ── */


function PerspectiveCoverage({ run }) {
  const coverage = React.useMemo(() => {
    if (!run) return {};
    const corpus = [
      run.group_summary  || "",
      run.final_report   || "",
      briefText(run.structured_brief),
      ...(run.debate_messages || []).map((m) => m.content || ""),
    ].join(" ").toLowerCase();
    return Object.fromEntries(
      PERSPECTIVES.map((p) => [p.key, p.keywords.some((kw) => corpus.includes(kw.toLowerCase()))])
    );
  }, [run]);

  const coveredN = Object.values(coverage).filter(Boolean).length;
  const total    = PERSPECTIVES.length;
  const pct      = Math.round((coveredN / total) * 100);
  const allDone  = coveredN === total;

  if (!run) return null;

  return (
    <div className="intel-card">
      <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>视角覆盖</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? "#1A7A5E" : "var(--accent)" }}>
          {coveredN}/{total}
        </span>
      </h3>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", margin: "8px 0 10px" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: allDone ? "#1A7A5E" : "var(--accent)",
          transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>

      {/* Perspective rows */}
      <div style={{ display: "grid", gap: 6 }}>
        {PERSPECTIVES.map((p) => {
          const on = coverage[p.key];
          return (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: on ? "#1A7A5E" : "transparent",
                border: `1.5px solid ${on ? "#1A7A5E" : "var(--muted)"}`,
                boxShadow: on ? "0 0 0 2px rgba(26,122,94,0.14)" : "none",
              }} />
              <span style={{ fontSize: 12, fontWeight: on ? 600 : 400, color: on ? "var(--ink-soft)" : "var(--muted)" }}>
                {p.label}
              </span>
              {!on && (
                <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto", opacity: 0.7 }}>未覆盖</span>
              )}
            </div>
          );
        })}
      </div>

      {coveredN > 0 && !allDone && (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
          未覆盖视角可在下一轮讨论中补充
        </div>
      )}
      {allDone && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#1A7A5E", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
          ✓ 全部视角已覆盖
        </div>
      )}
    </div>
  );
}

function IntelRail({ run, loading, modelSettings, activePage, onNavigate, onCopy, onDownloadReport, onDownloadJson, onDownloadBundle, onExportPDF }) {
  const brief = run?.structured_brief;
  const assignments = modelSettings.assignments || {};
  const assignmentEntries = Object.entries(assignments);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="intel-card">
        <h3>当前 Run</h3>
        {run ? (
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <div className="intel-row"><span>Run ID</span><strong>{run.run_id?.slice(0, 12)}</strong></div>
            <div className="intel-row">
              <span>状态</span>
              <strong>
                <span className={`status-badge ${statusBadgeClass(run.status)}`}>
                  {loading ? "RUNNING" : run.status}
                </span>
              </strong>
            </div>
            {run?.template_input?.field ? <div className="intel-row"><span>领域</span><strong style={{fontSize:12}}>{run.template_input.field.length > 20 ? run.template_input.field.slice(0,20) + "..." : run.template_input.field}</strong></div> : null}
            {run.research_stage ? <div className="intel-row"><span>阶段</span><strong>{{auto: "自动", topic_exploration: "选题探索", plan_refinement: "方案收敛", result_diagnosis: "结果诊断", pivot_evaluation: "转向评估"}[run.research_stage] || run.research_stage}</strong></div> : null}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>尚未启动</div>
        )}
      </div>

      <div className="intel-card">
        <h3>快速操作</h3>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <button className="icon-button" style={{ width: "100%" }} onClick={() => onNavigate("create")}>
            <Play size={16} /> 新建讨论
          </button>
          {run ? (
            <button className="icon-button" style={{ width: "100%" }} onClick={() => onNavigate("debate")}>
              <Brain size={16} /> 查看讨论
            </button>
          ) : null}
          {run?.final_report ? (
            <button className="icon-button" style={{ width: "100%" }} onClick={() => onNavigate("report")}>
              <Clipboard size={16} /> 查看报告
            </button>
          ) : null}
          {run?.structured_ir?.candidate_directions?.length > 0 ? (
            <button className="icon-button" style={{ width: "100%" }} onClick={() => onNavigate("report")}>
              <Sparkles size={16} /> 方向卡片 ({run.structured_ir.candidate_directions.length})
            </button>
          ) : null}
        </div>
      </div>

      <PerspectiveCoverage run={run} />

      {assignmentEntries.length > 0 ? (
        <div className="intel-card">
          <h3>模型分配</h3>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {assignmentEntries.map(([agentKey, modelRef]) => (
              <div className="intel-row" key={agentKey}>
                <span>{agentKey}</span>
                <strong>{modelRef.split(":").pop()}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="intel-card">
        <h3>导出</h3>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <div><DownloadMenu label="报告" disabled={!run?.final_report} mdContent={run?.final_report} pdfContent={run?.final_report} pdfTitle={`K-Storm 报告 ${run?.run_id || ""}`} /></div>
          <div><DownloadMenu label="打包" disabled={!run?.final_report && !run?.group_summary && !run?.debate_messages?.length} mdContent={buildBundleMD(run)} pdfContent={buildBundleMD(run)} pdfTitle={`K-Storm 打包 ${run?.run_id || ""}`} /></div>
          <button className="icon-button" style={{ width: "100%" }} disabled={!run} onClick={onDownloadJson}>
            <Download size={16} /> Run JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function RunOverview({ run, loading, activeRounds, onRerun, onCancel, onConfirmRerun, onUpgrade }) {
  const brief = run?.structured_brief;
  const isCompleted = run?.status === "COMPLETED";
  const isFailed = run?.status === "FAILED" || run?.status === "CANCELED";
  const canRerun = (isFailed || isCompleted) && !loading;
  const rerunLabel = isFailed ? "继续分析" : "重新分析";

  // 升级链路：Quick Probe → Focused Panel → Full Deliberation
  const upgradeTarget = isCompleted && !loading
    ? run?.mode === "quick" ? "focused"
    : run?.mode === "focused" ? "full"
    : null
    : null;
  const upgradeLabel = upgradeTarget === "focused" ? "升级为聚焦研讨" : upgradeTarget === "full" ? "升级为完整讨论" : null;

  return (
    <section className="panel overview">
      <div className="panel-title">
        <div>
          <h2>运行概览</h2>
          <p>{run ? `Run ID：${run.run_id}` : "等待启动一次 KS 工作流"}</p>
          {run?.research_stage ? <p style={{ marginTop: 4 }}>阶段：{{auto: "自动判断", topic_exploration: "选题探索", plan_refinement: "方案收敛", result_diagnosis: "结果诊断", pivot_evaluation: "转向评估"}[run.research_stage] || run.research_stage}</p> : null}
        </div>
        <div className="header-actions">
          {loading ? (
            <button className="danger-button" style={{minHeight: 38}} onClick={onCancel}>
              停止分析
            </button>
          ) : null}
          {upgradeTarget && (
            <button
              className="icon-button"
              style={{ background: "var(--blue-50,#eff6ff)", borderColor: "var(--blue-400,#60a5fa)", color: "var(--blue-700,#1d4ed8)" }}
              onClick={() => onUpgrade && onUpgrade(run, upgradeTarget)}
              title="携带当前上下文，升级为更完整的讨论模式"
            >
              <ArrowUpCircle size={18} />
              <span>{upgradeLabel}</span>
            </button>
          )}
          <button className="icon-button" disabled={!canRerun} onClick={() => {
            if (isCompleted) {
              if (window.confirm("当前记录为 COMPLETED 状态，确认重新分析？")) {
                onConfirmRerun(run);
              }
            } else {
              onRerun();
            }
          }}>
            <RefreshCw size={18} />
            <span>{rerunLabel}</span>
          </button>
        </div>
      </div>

      {upgradeTarget && (
        <div style={{ padding: "10px 16px", background: "var(--blue-50,#eff6ff)", borderRadius: 8, border: "1px solid var(--blue-200,#bfdbfe)", marginBottom: 8, fontSize: 13, color: "var(--blue-800,#1e40af)", display: "flex", alignItems: "center", gap: 8 }}>
          <ArrowUpCircle size={15} />
          <span>当前为 <strong>{{quick:"快速探测",focused:"聚焦研讨"}[run.mode]}</strong>，可一键升级并自动携带上下文。</span>
        </div>
      )}

      <div className="metric-row">
        <Metric
          label="讨论轮次"
          value={
            run
              ? Math.max(...run.debate_messages.map((message) => message.round), 0)
              : "-"
          }
        />
        <Metric label="Agent 发言" value={run ? run.debate_messages.length : "-"} />
        <Metric label="状态" value={loading ? "RUNNING" : run?.status ?? "READY"} />
      </div>

      <DeliverablesStrip run={run} />

      <ProgressTimeline run={run} activeRounds={activeRounds} />

      {brief ? (
        <div className="brief-grid">
          <BriefBlock title="已知事实" items={brief.known_facts} />
          <BriefBlock title="未知问题" items={brief.unknowns} />
          <BriefBlock title="约束条件" items={brief.constraints} />
          <BriefBlock title="机会点" items={brief.opportunity_points} />
          {brief.omitted_notes?.length ? (
            <div className="brief-block brief-wide omitted-notes">
              <h3>⚠️ 因预算省略的关键点</h3>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                大文档摘要模式下，以下信息可能重要但未进入分析，请人工确认是否需要补充。
              </p>
              <ul>
                {brief.omitted_notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {brief.intake_synthesis ? (
            <div className="brief-block brief-wide">
              <CollapsibleMarkdown title="入口整合 Briefing" content={brief.intake_synthesis} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-state">
          <FlaskConical size={28} />
          <span>提交模板后，这里会显示入口 Agent 生成的结构化 briefing。</span>
        </div>
      )}
    </section>
  );
}

function CollapsibleMarkdown({ title, content }) {
  const [expanded, setExpanded] = React.useState(false);
  const bodyRef = React.useRef(null);
  const scrollTopRef = React.useRef(0);
  React.useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = scrollTopRef.current;
  });
  return (
    <div className="briefing-card">
      <div className="briefing-head">
        <h3>{title}</h3>
        <div className="inline-actions">
          <CopyButton text={content} />
          <button className="icon-button progress-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起" : "展开"}
          </button>
        </div>
      </div>
      <div
        ref={bodyRef}
        className={`briefing-body markdown-rendered ${expanded ? "expanded" : ""}`}
        onScroll={(event) => {
          scrollTopRef.current = event.currentTarget.scrollTop;
        }}
        dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
      />
    </div>
  );
}


function CopyButton({ text, className = "" }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      className={`icon-button copy-mini ${className}`}
      disabled={!text}
      onClick={async () => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function ExpandButton({ onClick, title = "全文查看" }) {
  return (
    <button className="icon-button expand-mini" onClick={onClick} title={title}>
      <Maximize2 size={13} />
    </button>
  );
}

function MessageExpandModal({ message, onClose }) {
  React.useEffect(() => {
    if (!message) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  if (!message) return null;

  const agentKey = agentKeyFromDisplay(message.agent);

  return (
    <div className="msg-expand-overlay" onClick={onClose}>
      <div
        className="msg-expand-modal"
        data-agent={agentKey}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="msg-expand-header">
          <div className="msg-expand-title">
            <strong>{message.agent}</strong>
            {message.model_label && (
              <span className="agent-model-label">{message.model_label}</span>
            )}
            <span className="msg-expand-round">第 {message.round} 轮</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <CopyButton text={message.content} />
            <button className="icon-button copy-mini" onClick={onClose} title="关闭 (Esc)">
              <X size={15} />
            </button>
          </div>
        </div>
        <div
          className="msg-expand-body markdown-rendered"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      </div>
    </div>
  );
}

function ProgressTimeline({ run, activeRounds }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!run) return null;
  if (run.timeline?.length) {
    const rows = run.timeline.filter((step) => !step.is_overall);
    const overall = run.timeline.find((step) => step.is_overall);
    const visibleRows = progressRows(rows, overall, expanded);
    return (
      <div className="progress-list">
        <div className="progress-toolbar">
          <small>{expanded ? "完整运行状态" : "当前运行状态"}</small>
          <button className="icon-button progress-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起" : "展开"}
          </button>
        </div>
        {visibleRows.map(({ step, overall: isOverall }) => (
          <TimelineStepRow key={step.key} step={step} overall={isOverall} />
        ))}
      </div>
    );
  }
  const totalDebateMessages = activeRounds * 4;
  const debateDone = run.debate_messages.length;
  const status = run.status;
  const steps = [
    [
      "创建运行并校验模板",
      ["INTAKE_RUNNING", "DEBATE_RUNNING", "GROUP_SUMMARY_RUNNING", "FINAL_REPORT_RUNNING", "COMPLETED"].includes(status),
      ["CREATED", "TEMPLATE_VALIDATED"].includes(status),
    ],
    ["入口模型整理模板与上传文档", Boolean(run.structured_brief), status === "INTAKE_RUNNING"],
    ["信息传送到讨论组", Boolean(run.structured_brief), status === "DEBATE_RUNNING" && debateDone === 0],
    ...run.debate_messages.map((message) => [
      `${message.agent} 发言（第 ${message.round} 轮）`,
      true,
      false,
    ]),
  ];
  if (status === "DEBATE_RUNNING" && debateDone < totalDebateMessages) {
    const order = ["Novelty Agent", "Mechanism Agent", "Feasibility Agent", "Reviewer Agent"];
    steps.push([run.current_step || `${order[debateDone % 4]} 发言中`, false, true]);
  }
  steps.push(["Critique 批判审查", Boolean(run.critique_report), status === "CRITIQUE_RUNNING"]);
  steps.push(["结构化 IR", Boolean(run.group_summary), status === "GROUP_SUMMARY_RUNNING"]);
  steps.push(["Citation Review 引用审查", Boolean(run.citation_review), status === "CITATION_REVIEW_RUNNING"]);
  steps.push(["出口模型生成最终报告", Boolean(run.final_report), status === "FINAL_REPORT_RUNNING"]);
  if (status === "COMPLETED") steps.push(["运行完成", true, false]);
  if (status === "FAILED") {
    steps.push([`运行失败${run.error ? `：${run.error}` : ""}`, false, true]);
  }

  return (
    <div className="progress-list">
      {steps.map(([label, done, active], index) => (
        <div
          className={`progress-step ${done ? "done" : ""} ${active ? "active" : ""}`}
          key={`${label}-${index}`}
        >
          <span className="progress-dot" />
          <span className="progress-label">{label}</span>
          <span className="progress-time" />
        </div>
      ))}
    </div>
  );
}

function progressRows(rows, overall, expanded) {
  if (expanded) {
    return [
      ...rows.map((step) => ({ step, overall: false })),
      ...(overall ? [{ step: overall, overall: true }] : []),
    ];
  }
  const current = rows.find(
    (step) => step.status === "running" || step.status === "failed",
  );
  if (current) return [{ step: current, overall: false }];
  if (overall && ["running", "failed", "completed"].includes(overall.status)) {
    return [{ step: overall, overall: true }];
  }
  const lastDone = [...rows].reverse().find((step) => step.status === "completed");
  return lastDone ? [{ step: lastDone, overall: false }] : rows.slice(0, 1).map((step) => ({ step, overall: false }));
}

function TimelineStepRow({ step, overall = false }) {
  const done = step.status === "completed";
  const active = step.status === "running" || step.status === "failed";
  return (
    <div className={`progress-step ${done ? "done" : ""} ${active ? "active" : ""} ${overall ? "progress-overall" : ""}`}>
      <span className="progress-dot" />
      <span className="progress-label">{step.label}</span>
      <span className="progress-time">{timelineTimeLabel(step)}</span>
    </div>
  );
}

function timelineTimeLabel(step) {
  if (step.status === "completed" && step.finished_at) return `完成 ${formatStepTime(step.finished_at)}`;
  if (step.status === "failed" && step.finished_at) return `失败 ${formatStepTime(step.finished_at)}`;
  if (step.estimated_done_at) return `预计 ${formatStepTime(step.estimated_done_at)}`;
  return "";
}

function formatStepTime(value) {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BriefBlock({ title, items }) {
  return (
    <div className="brief-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="markdown-rendered" dangerouslySetInnerHTML={{ __html: markdownToHtml(item) }} />
        ))}
      </ul>
    </div>
  );
}


/* ── Debate Workflow Visualizer ── */
const FLOW_AGENTS = [
  { key: "novelty",     label: "Novelty",     color: "#2D4DB5", bg: "#EDF2FF" },
  { key: "mechanism",   label: "Mechanism",   color: "#6B4FB8", bg: "#F0F0FF" },
  { key: "feasibility", label: "Feasibility", color: "#1A7A5E", bg: "#EDFAF6" },
  { key: "reviewer",    label: "Reviewer",    color: "#B03050", bg: "#FFF3F3" },
];

function DebateFlowChart({ run, onSelectRound }) {
  const messages  = run?.debate_messages ?? [];
  const rounds    = [...new Set(messages.map((m) => m.round))].sort((a, b) => a - b);
  const hasIntake = Boolean(run?.structured_brief);
  const hasIR     = Boolean(run?.group_summary);
  const hasReport = Boolean(run?.final_report);

  // ── Layout constants ──
  const LBL_W  = 62;   // left label column
  const NR     = 15;   // all node radius (parallel and sequential both use NR)
  const RP     = 5;    // rect padding around circles
  const NS     = 88;   // node center-to-center spacing
  const ROW_H  = 82;   // vertical distance between round rows
  const INTAKE_CY = 28;

  // X center of each agent slot
  const ax = (i) => LBL_W + 14 + NR + i * NS;
  const chainCenterX = (ax(0) + ax(3)) / 2;
  const WRAP_X = ax(3) + NR + RP + 24; // where wrap arrow swings out

  const firstRowCY = INTAKE_CY + NR + 38 + NR;
  const rowCY = (ri) => firstRowCY + ri * ROW_H;

  const footerCY = (rounds.length > 0 ? rowCY(rounds.length - 1) : firstRowCY) + NR + 36;
  const irX   = chainCenterX - 54;
  const repX  = chainCenterX + 54;

  const SVG_W = WRAP_X + 22;
  const SVG_H = footerCY + NR + 22;

  const agentHasMsg = (key, r) =>
    messages.some((m) => agentKeyFromDisplay(m.agent) === key && m.round === r);

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {FLOW_AGENTS.map((a) => (
          <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: a.bg, border: `2px solid ${a.color}`, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{a.label}</span>
          </div>
        ))}
      </div>

      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
           style={{ display: "block", fontFamily: "var(--font-sans)" }}>
        <defs>
          <marker id="fc-arr" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#9BA8C2" />
          </marker>
        </defs>

        {/* ── 入口整合 node ── */}
        <circle cx={chainCenterX} cy={INTAKE_CY} r={NR}
                fill={hasIntake ? "var(--accent-soft)" : "transparent"}
                stroke={hasIntake ? "var(--accent)" : "var(--border)"}
                strokeWidth="2" strokeDasharray={hasIntake ? "none" : "3 2"} />
        <text x={chainCenterX} y={INTAKE_CY} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="800" fill={hasIntake ? "var(--accent)" : "var(--muted)"}>入口</text>
        <text x={chainCenterX} y={INTAKE_CY + NR + 11} textAnchor="middle"
              fontSize="9" fill={hasIntake ? "var(--ink-soft)" : "var(--muted)"}>入口整合</text>

        {/* intake → first round arrow */}
        {rounds.length > 0 && (
          <line x1={chainCenterX} y1={INTAKE_CY + NR + 1}
                x2={chainCenterX} y2={firstRowCY - NR - 6}
                stroke="#9BA8C2" strokeWidth="1.5" markerEnd="url(#fc-arr)" />
        )}

        {/* ── Round rows ── */}
        {rounds.map((round, ri) => {
          const cy    = rowCY(ri);
          const isPar = round === 1;
          const hasNext = ri < rounds.length - 1;
          const nextCY  = rowCY(ri + 1);

          return (
            <g key={round}>
              {/* Row label */}
              <text x={LBL_W - 4} y={cy - 7} textAnchor="end" dominantBaseline="middle"
                    fontSize="11" fontWeight="700" fill="var(--ink-soft)">第{round}轮</text>
              <text x={LBL_W - 4} y={cy + 9} textAnchor="end" dominantBaseline="middle"
                    fontSize="9"  fontWeight="700"
                    fill={isPar ? "#1A7A5E" : "#B03050"}>
                {isPar ? "并行" : "串行"}
              </text>

              {isPar ? (
                /* ── Parallel: rectangle with same-size NR circles ── */
                <g onClick={() => onSelectRound(round)} style={{ cursor: "pointer" }}>
                  <rect x={ax(0) - NR - RP} y={cy - NR - RP}
                        width={ax(3) - ax(0) + NR * 2 + RP * 2} height={(NR + RP) * 2}
                        rx="10" fill="var(--panel-muted)"
                        stroke="var(--border-strong)" strokeWidth="1.5" />
                  {FLOW_AGENTS.map((a, i) => {
                    const on = agentHasMsg(a.key, round);
                    return (
                      <g key={a.key}>
                        <circle cx={ax(i)} cy={cy} r={NR}
                                fill={on ? a.bg : "transparent"}
                                stroke={on ? a.color : "var(--border)"}
                                strokeWidth={on ? 2 : 1.5}
                                strokeDasharray={!on ? "3 2" : "none"} />
                        {on && (
                          <text x={ax(i)} y={cy} textAnchor="middle" dominantBaseline="middle"
                                fontSize="10" fontWeight="800" fill={a.color}>
                            {a.label[0]}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              ) : (
                /* ── Sequential: chain ○ → ○ → ○ → ○ ── */
                <g>
                  {FLOW_AGENTS.map((a, i) => {
                    const on = agentHasMsg(a.key, round);
                    return (
                      <g key={a.key} style={{ cursor: "pointer" }}
                         onClick={() => onSelectRound(round)}>
                        {i > 0 && (
                          <line x1={ax(i - 1) + NR + 2} y1={cy}
                                x2={ax(i) - NR - 2}     y2={cy}
                                stroke="#9BA8C2" strokeWidth="1.5"
                                markerEnd="url(#fc-arr)" />
                        )}
                        <circle cx={ax(i)} cy={cy} r={NR}
                                fill={on ? a.bg : "transparent"}
                                stroke={on ? a.color : "var(--border)"}
                                strokeWidth="2"
                                strokeDasharray={!on ? "3 2" : "none"} />
                        <text x={ax(i)} y={cy} textAnchor="middle" dominantBaseline="middle"
                              fontSize="10" fontWeight="800"
                              fill={on ? a.color : "var(--muted)"}>
                          {a.label[0]}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* ── Wrap arrow: R's right edge → N's left edge of next round ── */}
              {hasNext && (
                <path
                  d={`M ${ax(3) + NR + RP + 1} ${cy}
                      L ${WRAP_X} ${cy}
                      Q ${WRAP_X + 14} ${cy} ${WRAP_X + 14} ${cy + ROW_H / 2}
                      Q ${WRAP_X + 14} ${nextCY} ${WRAP_X} ${nextCY}
                      L ${ax(0) - NR - 2} ${nextCY}`}
                  fill="none" stroke="#9BA8C2" strokeWidth="1.5"
                  markerEnd="url(#fc-arr)" />
              )}
            </g>
          );
        })}

        {/* ── Down arrow: last round → IR ── */}
        {rounds.length > 0 && (
          <line x1={chainCenterX} y1={rowCY(rounds.length - 1) + NR + 2}
                x2={chainCenterX} y2={footerCY - NR - 6}
                stroke="#9BA8C2" strokeWidth="1.5" markerEnd="url(#fc-arr)" />
        )}

        {/* ── IR node ── */}
        <circle cx={irX} cy={footerCY} r={NR}
                fill={hasIR ? "var(--accent-soft)" : "transparent"}
                stroke={hasIR ? "var(--accent)" : "var(--border)"}
                strokeWidth="2" strokeDasharray={!hasIR ? "3 2" : "none"} />
        <text x={irX} y={footerCY} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="800" fill={hasIR ? "var(--accent)" : "var(--muted)"}>IR</text>
        <text x={irX} y={footerCY + NR + 11} textAnchor="middle"
              fontSize="9" fill={hasIR ? "var(--ink-soft)" : "var(--muted)"}>IR 汇总</text>

        {/* ── IR → Report arrow ── */}
        <line x1={irX + NR + 2} y1={footerCY}
              x2={repX - NR - 2} y2={footerCY}
              stroke="#9BA8C2" strokeWidth="1.5" markerEnd="url(#fc-arr)" />

        {/* ── Report node ── */}
        <circle cx={repX} cy={footerCY} r={NR}
                fill={hasReport ? "var(--accent-soft)" : "transparent"}
                stroke={hasReport ? "var(--accent)" : "var(--border)"}
                strokeWidth="2" strokeDasharray={!hasReport ? "3 2" : "none"} />
        <text x={repX} y={footerCY} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="800" fill={hasReport ? "var(--accent)" : "var(--muted)"}>报</text>
        <text x={repX} y={footerCY + NR + 11} textAnchor="middle"
              fontSize="9" fill={hasReport ? "var(--ink-soft)" : "var(--muted)"}>最终报告</text>
      </svg>
    </div>
  );
}

function DebateView({ run, streamingPartial }) {
  const [activeRound, setActiveRound] = React.useState(1);
  const [showChart, setShowChart] = React.useState(true);
  const [expandedMsg, setExpandedMsg] = React.useState(null);
  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [interjectText, setInterjectText] = React.useState("");
  const [interjectBusy, setInterjectBusy] = React.useState(false);
  const searchRef = React.useRef(null);

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const message of run?.debate_messages ?? []) {
      if (!map.has(message.round)) map.set(message.round, []);
      map.get(message.round).push(message);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [run]);
  React.useEffect(() => {
    if (grouped.length && !grouped.some(([round]) => round === activeRound)) {
      setActiveRound(grouped[0][0]);
    }
  }, [grouped, activeRound]);
  const roundList = grouped.map(([r]) => r);
  const roundIdx = roundList.indexOf(activeRound);
  const goPrevRound = () => roundIdx > 0 && setActiveRound(roundList[roundIdx - 1]);
  const goNextRound = () => roundIdx < roundList.length - 1 && setActiveRound(roundList[roundIdx + 1]);

  const allMessages = grouped.find(([round]) => round === activeRound)?.[1] || [];
  const kw = searchKeyword.trim();
  const activeMessages = kw
    ? allMessages.filter((m) => m.content.toLowerCase().includes(kw.toLowerCase()))
    : allMessages;
  const hiddenCount = allMessages.length - activeMessages.length;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>讨论过程</h2>
          <p>第 1 轮可并行独立发言，第 2 轮起串行反驳/修正。</p>
        </div>
        <button className="icon-button" onClick={() => setShowChart((v) => !v)}
                style={{ fontSize: 12, padding: "4px 10px", opacity: 0.75 }}>
          {showChart ? "隐藏流程图" : "显示流程图"}
        </button>
      </div>

      {showChart && (
        <div style={{ background: "var(--panel-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 12px 8px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>Workflow · 点击轮次节点跳转</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DebateFlowChart run={run} onSelectRound={setActiveRound} />
          </div>
        </div>
      )}

      {grouped.length ? (
        <div className="rounds">
          {/* ── 轮次导航 + 搜索框同行 ── */}
          <div className="round-tabs-row">
            <button
              className="icon-button round-nav-arrow"
              disabled={roundIdx <= 0}
              onClick={goPrevRound}
              title="上一轮"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="round-tabs">
              {grouped.map(([round]) => (
                <button
                  className={`icon-button round-tab ${round === activeRound ? "active" : ""}`}
                  key={round}
                  onClick={() => setActiveRound(round)}
                >
                  第 {round} 轮
                </button>
              ))}
            </div>
            <button
              className="icon-button round-nav-arrow"
              disabled={roundIdx >= roundList.length - 1}
              onClick={goNextRound}
              title="下一轮"
            >
              <ChevronRight size={15} />
            </button>
            <div className="debate-search-wrap">
              <Search size={13} className="debate-search-icon" />
              <input
                ref={searchRef}
                className="debate-search-input"
                type="text"
                placeholder="关键词高亮搜索…"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              {kw && (
                <button
                  className="debate-search-clear"
                  onClick={() => { setSearchKeyword(""); searchRef.current?.focus(); }}
                  title="清除"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {kw && (
              <span className="debate-search-hint">
                {activeMessages.length > 0
                  ? `${activeMessages.length}/${allMessages.length} 条`
                  : "无匹配"}
              </span>
            )}
          </div>

          <div className="round">
            <div className="round-heading">第 {activeRound} 轮</div>
            {activeMessages.length === 0 && kw && (
              <div className="empty-line" style={{ marginTop: 12 }}>
                当前轮次无 "{kw}" 相关内容
              </div>
            )}
            <div className="message-grid">
              {activeMessages.map((message) => {
                const charCount = message.content.length;
                const renderedHtml = kw
                  ? highlightKeyword(markdownToHtml(message.content), kw)
                  : markdownToHtml(message.content);
                const isHuman = message.is_human || message.agent === "你";
                return (
                <article
                  className={`agent-card ${isHuman ? "human-card" : ""}`}
                  data-agent={isHuman ? "human" : agentKeyFromDisplay(message.agent)}
                  key={`${message.round}-${message.agent}-${message.title || ""}`}
                >
                  <div className="agent-card-header">
                    <strong>{message.agent}</strong>
                    <span className="agent-model-label">{message.model_label || ""}</span>
                    <span className="content-head">
                      <span className="char-count-badge">{charCount.toLocaleString()} 字</span>
                      <CopyButton text={message.content} />
                      <ExpandButton onClick={() => setExpandedMsg(message)} />
                    </span>
                  </div>
                  <div
                    className="agent-card-body markdown-rendered"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </article>
                );
              })}
              {/* 流式幻影卡片：当前正在生成的 agent token 流 */}
              {(() => {
                const sp = streamingPartial;
                if (!sp?.partial || sp.round !== activeRound) return null;
                // 若该 agent 的完整消息已在 activeMessages 中，不重复显示
                const alreadyConfirmed = activeMessages.some((m) => m.agent === sp.agent);
                if (alreadyConfirmed) return null;
                // 剥掉尾部结束标记，避免显示给用户
                const cleanPartial = sp.partial
                  .replace(/<<<END_OF_[A-Z_]+>>>/g, "")
                  .trimEnd();
                if (!cleanPartial) return null;
                return (
                  <article className="agent-card streaming" data-agent={agentKeyFromDisplay(sp.agent)} key="__streaming__">
                    <div className="agent-card-header">
                      <strong>{sp.agent}</strong>
                      <span className="content-head">
                        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.04em" }}>● 生成中</span>
                      </span>
                    </div>
                    <div
                      className="agent-card-body markdown-rendered"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(cleanPartial) }}
                    />
                  </article>
                );
              })()}
            </div>
            {/* 人工介入：在当前轮 agent 发言后插入意见，下一轮 agent 自动携带 */}
            {run?.run_id && !kw ? (
              <div className="human-interjection-bar">
                <textarea
                  className="human-interjection-input"
                  rows={2}
                  value={interjectText}
                  placeholder={`对第 ${activeRound} 轮的讨论补充你的意见或约束（提交后下一轮 Agent 会参考这条意见）…`}
                  onChange={(e) => setInterjectText(e.target.value)}
                  disabled={interjectBusy}
                />
                <button
                  className="icon-button human-interjection-submit"
                  disabled={interjectBusy || !interjectText.trim()}
                  onClick={async () => {
                    if (!interjectText.trim()) return;
                    setInterjectBusy(true);
                    try {
                      const resp = await fetch(`${API_BASE}/api/runs/${run.run_id}/interject`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ round: activeRound, content: interjectText.trim() }),
                      });
                      if (!resp.ok) throw new Error("提交失败");
                      setInterjectText("");
                    } catch {
                      // 忽略，SSE 会刷新
                    } finally {
                      setInterjectBusy(false);
                    }
                  }}
                >
                  <ArrowUpCircle size={16} />
                  <span>{interjectBusy ? "提交中" : "插入意见"}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="empty-line">还没有讨论记录。</div>
      )}

      {/* ── Critique 独立批判报告 ──────────────────────────────── */}
      {(run?.critique_report || run?.status === "CRITIQUE_RUNNING") && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            borderBottom: "2px solid var(--rose, #B03050)", paddingBottom: 6,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--rose, #B03050)" }}>🔍 Critique Agent · 独立批判审查</span>
            {run?.status === "CRITIQUE_RUNNING" && !run?.critique_report && (
              <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>● 生成中</span>
            )}
          </div>
          {run?.critique_report ? (
            <article className="agent-card" data-agent="critique" style={{ borderLeft: "3px solid var(--rose, #B03050)" }}>
              <div className="agent-card-header">
                <strong>Critique Agent</strong>
                <span className="content-head">
                  <CopyButton text={run.critique_report} />
                  <ExpandButton onClick={() => setExpandedMsg({ agent: "Critique Agent", content: run.critique_report, round: "—", model_label: "" })} />
                </span>
              </div>
              <div className="agent-card-body markdown-rendered"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(run.critique_report) }} />
            </article>
          ) : (
            <div className="empty-line">批判审查生成中…</div>
          )}
        </div>
      )}

      {/* ── Citation Review 引用审查报告 ──────────────────────── */}
      {(run?.citation_review || run?.status === "CITATION_REVIEW_RUNNING") && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            borderBottom: "2px solid var(--violet, #6B4FB8)", paddingBottom: 6,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--violet, #6B4FB8)" }}>📚 Citation Review Agent · 引用线索审查</span>
            {run?.status === "CITATION_REVIEW_RUNNING" && !run?.citation_review && (
              <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>● 生成中</span>
            )}
          </div>
          {run?.citation_review ? (
            <article className="agent-card" data-agent="citation_review" style={{ borderLeft: "3px solid var(--violet, #6B4FB8)" }}>
              <div className="agent-card-header">
                <strong>Citation Review Agent</strong>
                <span className="content-head">
                  <CopyButton text={run.citation_review} />
                  <ExpandButton onClick={() => setExpandedMsg({ agent: "Citation Review Agent", content: run.citation_review, round: "—", model_label: "" })} />
                </span>
              </div>
              <div className="agent-card-body markdown-rendered"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(run.citation_review) }} />
            </article>
          ) : (
            <div className="empty-line">引用审查生成中…</div>
          )}
        </div>
      )}

      <MessageExpandModal message={expandedMsg} onClose={() => setExpandedMsg(null)} />
    </section>
  );
}


function reportTitleForRun(run) {
  const mode = run?.mode;
  const stage = run?.research_stage;
  if (mode === "quick") return "快速探测结果";
  if (mode === "memory") return "追问分析报告";
  if (mode === "focused") return "聚焦分析报告";
  return {
    topic_exploration: "选题建议报告",
    plan_refinement: "当前课题推进建议报告",
    result_diagnosis: "实验结果诊断与推进报告",
    pivot_evaluation: "路线偏差评估与调整建议",
    auto: "最终报告",
  }[stage] || "最终报告";
}

// ── Module D: 候选方向可视化 ──────────────────────────────
function parseScore(text) {
  if (!text) return 0;
  const frac = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (frac) return Math.round((parseFloat(frac[1]) / parseFloat(frac[2])) * 100);
  const pct = text.match(/(\d+)\s*%/);
  if (pct) return parseInt(pct[1]);
  const kw = text;
  if (/很高|非常高|极高/.test(kw)) return 90;
  if (/较高|中高/.test(kw)) return 70;
  if (/^高$|高，|高。|高（/.test(kw) || kw === "高") return 80;
  if (/高/.test(kw)) return 78;
  if (/中等|中低/.test(kw)) return 45;
  if (/中高/.test(kw)) return 65;
  if (/^中$/.test(kw.trim()) || kw === "中") return 52;
  if (/中/.test(kw)) return 55;
  if (/较低|偏低/.test(kw)) return 28;
  if (/低/.test(kw)) return 22;
  return 50;
}

function ScoreBar({ label, text, color }) {
  const pct = parseScore(text);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontSize: 12 }}>{text || "—"}</span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

function DirectionCard({ dir }) {
  const isTop = dir.priority === 1;
  return (
    <div style={{
      border: isTop ? "2px solid var(--accent)" : "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "18px 20px",
      background: isTop ? "var(--accent-soft)" : "var(--surface)",
      position: "relative",
    }}>
      {isTop && (
        <div style={{
          position: "absolute", top: -1, right: 18,
          background: "var(--accent)", color: "#fff",
          fontSize: 11, fontWeight: 700, padding: "3px 12px",
          borderRadius: "0 0 8px 8px", letterSpacing: "0.05em",
        }}>★ 首推方向</div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          background: isTop ? "var(--accent)" : "var(--border)",
          color: isTop ? "#fff" : "var(--text-muted)",
          fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{dir.priority}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "var(--text)" }}>{dir.title}</div>
          {dir.research_question && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{dir.research_question}</div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: 14 }}>
        <ScoreBar label="创新性" text={dir.novelty} color="var(--accent)" />
        <ScoreBar label="可行性" text={dir.feasibility} color="#16a34a" />
      </div>
      {dir.risks?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>风险</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dir.risks.map((r, i) => (
              <span key={i} style={{ fontSize: 11, padding: "3px 9px", background: "rgba(220,38,38,0.07)", color: "#b91c1c", borderRadius: 12, border: "1px solid rgba(220,38,38,0.18)" }}>{r}</span>
            ))}
          </div>
        </div>
      )}
      {dir.next_actions?.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>下一步</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dir.next_actions.map((a, i) => (
              <span key={i} style={{ fontSize: 11, padding: "3px 9px", background: "var(--accent-soft)", color: "var(--accent-strong)", borderRadius: 12, border: "1px solid var(--accent)" }}>{a}</span>
            ))}
          </div>
        </div>
      )}
      {dir.priority_reason && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>排序理由：</span>{dir.priority_reason}
        </div>
      )}
    </div>
  );
}

function DirectionPanel({ run }) {
  const directions = React.useMemo(
    () => (run?.structured_ir?.candidate_directions || []).slice().sort((a, b) => (a.priority || 99) - (b.priority || 99)),
    [run?.structured_ir]
  );

  if (!run) return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>方向卡片</h2>
          <p>
            {directions.length
              ? `来自 V1.5 结构化 IR 的 ${directions.length} 个候选研究方向，按综合优先级排序。`
              : "完成一次完整讨论后将自动解析候选方向。"}
          </p>
        </div>
      </div>
      {directions.length ? (
        <div style={{ display: "grid", gap: 14 }}>
          {directions.map((dir) => <DirectionCard key={dir.id} dir={dir} />)}
        </div>
      ) : (
        <div className="empty-line">暂无候选方向数据。</div>
      )}
    </section>
  );
}
// ── End Module D ───────────────────────────────────────────

function ReportView({
  run,
  copied,
  onCopy,
  onDownloadReport,
  onDownloadJson,
  onDownloadBundle,
  onExportPDF,
  onNavigate,
}) {
  return (
    <section className="panel report-panel">
      <div className="panel-title">
        <div>
          <h2>{reportTitleForRun(run)}</h2>
          <p>{{full: "Markdown 格式，可直接复制到开题或组会讨论材料。", focused: "针对特定问题的深度分析报告。", memory: "基于历史讨论的追问分析报告。", quick: "单 Agent 快速问答结果。"}[run?.mode] || "Markdown 格式，可直接复制到开题或组会讨论材料。"}</p>
        </div>
        <div className="inline-actions multi-actions">
          <DownloadMenu label="报告" disabled={!run?.final_report} mdContent={run?.final_report} pdfContent={run?.final_report} pdfTitle={`K-Storm 报告 ${run?.run_id || ""}`} />
          <DownloadMenu label="打包" disabled={!run?.final_report && !run?.group_summary && !run?.debate_messages?.length} mdContent={buildBundleMD(run)} pdfContent={buildBundleMD(run)} pdfTitle={`K-Storm 打包 ${run?.run_id || ""}`} />
          <button className="icon-button" disabled={!run} onClick={onDownloadJson}>
            <Download size={18} />
            <span>JSON</span>
          </button>
          <button
            className="icon-button"
            disabled={!run?.final_report}
            onClick={onCopy}
          >
            {copied ? <Check size={18} /> : <Clipboard size={18} />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>
      </div>
      {run?.ir_warnings?.length ? (
        <div style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: "var(--radius-sm)", padding: "12px 16px", margin: "4px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309", marginBottom: 6 }}>证据绑定校验发现 {run.ir_warnings.length} 个问题</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
            {run.ir_warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}
      {run?.external_references?.length ? (
        <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0" }}>
          <div style={{ fontSize: 13, color: "var(--accent-strong)" }}>
            <BookOpen size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            本次讨论共引用 {run.external_references.length} 条外部论据
          </div>
          <button className="icon-button" style={{ fontSize: 12, minHeight: 30 }} onClick={() => onNavigate("refs")}>前往查看</button>
        </div>
      ) : null}
      {run?.final_report ? (
        <div
          className="markdown-output markdown-rendered"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(run.final_report) }}
        />
      ) : (
        <div className="empty-line">完成一次分析后会生成最终报告。</div>
      )}
    </section>
  );
}


createRoot(document.getElementById("root")).render(<App />);