// 导出 / 下载工具：文件名生成、文本/JSON/ZIP 下载、PDF 打印窗口。
// 从 main.jsx 抽取，保持行为完全一致。

import { createZipBlob } from "./zip.js";
import { markdownToHtml } from "./markdown.js";

function baseExportName(run) {
  const raw = `${run?.template_input?.field || "K-Storm-report"}-${run?.run_id || "run"}`;
  return raw
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "K-Storm-report";
}

export function reportFilename(run) {
  return `${baseExportName(run)}.md`;
}

export function runJsonFilename(run) {
  return `${baseExportName(run)}.json`;
}

function bundleFilename(run) {
  return `${baseExportName(run)}-bundle.zip`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(text, filename, mimeType) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  downloadBlob(blob, filename);
}

export function downloadMarkdown(text, filename) {
  downloadTextFile(text, filename, "text/markdown");
}

export function downloadJsonFile(value, filename) {
  downloadTextFile(JSON.stringify(value, null, 2), filename, "application/json");
}

function bundleEntriesForRun(run) {
  const entries = [];
  if (run?.final_report) {
    entries.push({ name: "report.md", data: run.final_report });
  }
  if (run?.group_summary) {
    entries.push({ name: "structured-ir.md", data: run.group_summary });
  }
  if (run?.debate_messages?.length) {
    const debateMD = run.debate_messages.map(
      (msg) => `### ${msg.agent} · 第 ${msg.round} 轮\n\n${msg.content}`,
    ).join("\n\n---\n\n");
    entries.push({ name: "debate.md", data: `# 讨论记录\n\n${debateMD}` });
  }
  entries.push({
    name: "metadata.json",
    data: JSON.stringify(
      {
        run_id: run?.run_id,
        status: run?.status,
        exported_at: new Date().toISOString(),
        field: run?.template_input?.field || "",
        rounds: run?.rounds,
        created_at: run?.created_at,
      },
      null,
      2,
    ),
  });
  return entries;
}

export function buildBundleMD(run) {
  const parts = [];
  parts.push(`# K-Storm 讨论打包`);
  parts.push(``);
  parts.push(`**Run ID**：${run?.run_id || ""}`);
  parts.push(`**领域**：${run?.template_input?.field || ""}`);
  parts.push(`**时间**：${run?.created_at ? new Date(run.created_at).toLocaleString() : ""}`);
  parts.push(``);
  if (run?.final_report) {
    parts.push(`---`);
    parts.push(``);
    parts.push(`## 最终报告`);
    parts.push(``);
    parts.push(run.final_report);
    parts.push(``);
  }
  if (run?.debate_messages?.length) {
    parts.push(`---`);
    parts.push(``);
    parts.push(`## 讨论记录`);
    parts.push(``);
    for (const msg of run.debate_messages) {
      parts.push(`### ${msg.agent} · 第 ${msg.round} 轮`);
      parts.push(``);
      parts.push(msg.content);
      parts.push(``);
    }
  }
  return parts.join("\n");
}

export function downloadRunBundle(run) {
  const entries = bundleEntriesForRun(run);
  if (!entries.length) return;
  const blob = createZipBlob(entries);
  downloadBlob(blob, bundleFilename(run));
}

/**
 * 打开新窗口渲染 Markdown 并触发浏览器打印（另存为 PDF）。
 * 原先 App.exportPDF 与 DownloadMenu.handlePDF 各有一份重复实现，统一收口到这里。
 */
export function openPdfPrintWindow(content, title = "K-Storm") {
  if (!content) return;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#0A1628;line-height:1.7;font-size:14px}
      h1{font-size:24px;color:#1A52B8;border-bottom:2px solid #1A52B8;padding-bottom:8px}
      h2{font-size:18px;color:#0A1628;margin-top:28px}
      h3{font-size:15px;color:#2C3E6A}
      blockquote{border-left:3px solid #1A52B8;padding-left:12px;color:#2C3E6A;margin:12px 0}
      code{background:#F2F6FD;padding:2px 6px;border-radius:4px;font-size:13px}
      pre{background:#F2F6FD;padding:14px;border-radius:8px;overflow-x:auto}
      table{border-collapse:collapse;width:100%;margin:12px 0}
      th,td{border:1px solid #D6E0F2;padding:8px 10px;text-align:left;font-size:13px}
      th{background:#E8F0FF;font-weight:700}
      ul,ol{padding-left:22px}
      hr{border:0;border-top:1px solid #D6E0F2;margin:20px 0}
      @media print{body{margin:0;padding:20px;max-width:none}}
    </style></head><body>${markdownToHtml(content)}</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
