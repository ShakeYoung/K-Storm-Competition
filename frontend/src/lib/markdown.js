// 手写 Markdown 渲染工具（无第三方依赖，先转义后替换，避免 XSS）。
// 从 main.jsx 抽取，保持行为完全一致。

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

export function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function isTableLine(line) {
  return line.includes("|") && line.split("|").length >= 3;
}

/**
 * 在已渲染的 HTML 文本节点中高亮关键词（只替换 >…< 之间的文本，不动标签属性）。
 */
export function highlightKeyword(html, keyword) {
  if (!keyword || !keyword.trim()) return html;
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${esc})`, "gi");
  return html.replace(/>([^<]+)</g, (_, text) =>
    ">" + text.replace(re, '<mark class="kw-hl">$1</mark>') + "<"
  );
}

export function markdownToHtml(markdown) {
  const raw = String(markdown || "").trim();
  // If the content looks like raw JSON, render it as a formatted code block
  if (raw.startsWith("{") && raw.includes('"version"')) {
    try {
      const obj = JSON.parse(raw);
      return '<div class="json-fallback-notice"><strong>模型输出为 JSON 格式（Markdown 部分缺失），以下是解析后的内容：</strong></div>'
        + '<pre style="background:var(--panel-muted);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;overflow-x:auto;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all">'
        + JSON.stringify(obj, null, 2)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        + '</pre>';
    } catch {
      // Not valid JSON, render as-is
    }
  }
  const lines = String(markdown || "").split(/\r?\n/);
  let html = "";
  let listType = "";
  let inCode = false;
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = "";
    }
  };
  const renderTable = (tableLines) => {
    const rows = tableLines
      .filter(
        (row) =>
          !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row),
      )
      .map((row) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
    if (!rows.length) return "";
    const head = rows[0];
    const body = rows.slice(1);
    return `<div class="markdown-table-wrap"><table><thead><tr>${head
      .map((cell) => `<th>${inlineMarkdown(cell)}</th>`)
      .join("")}</tr></thead><tbody>${body
      .map(
        (row) =>
          `<tr>${head
            .map((_, index) => `<td>${inlineMarkdown(row[index] || "")}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody></table></div>`;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      closeList();
      if (!inCode) {
        html += "<pre><code>";
        inCode = true;
      } else {
        html += "</code></pre>";
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }
    if (!trimmed) {
      closeList();
      continue;
    }
    if (isTableLine(trimmed)) {
      closeList();
      const tableLines = [line];
      while (index + 1 < lines.length && isTableLine(lines[index + 1].trim())) {
        index += 1;
        tableLines.push(lines[index]);
      }
      html += renderTable(tableLines);
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      closeList();
      html += "<hr />";
    } else if (/^#{1,6}\s*/.test(trimmed)) {
      closeList();
      const match = trimmed.match(/^(#{1,6})\s*(.+)$/);
      const level = Math.min(match?.[1]?.length || 3, 3);
      html += `<h${level}>${inlineMarkdown(match?.[2] || trimmed)}</h${level}>`;
    } else if (/^>\s?/.test(trimmed)) {
      closeList();
      html += `<blockquote>${inlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`;
    } else if (/^[-*+]\s+/.test(trimmed)) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${inlineMarkdown(trimmed.replace(/^[-*+]\s+/, ""))}</li>`;
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${inlineMarkdown(trimmed.replace(/^\d+[.)]\s+/, ""))}</li>`;
    } else {
      closeList();
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  }
  closeList();
  if (inCode) html += "</code></pre>";
  return html;
}
