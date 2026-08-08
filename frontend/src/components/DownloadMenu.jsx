import React from "react";
import { Download } from "lucide-react";
import { downloadMarkdown, openPdfPrintWindow } from "../lib/download.js";

function DownloadMenu({ label, icon, mdContent, pdfContent, pdfTitle, disabled }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleMD() {
    setOpen(false);
    if (!mdContent) return;
    downloadMarkdown(mdContent, (pdfTitle || "K-Storm").replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 40));
  }
  function handlePDF() {
    setOpen(false);
    openPdfPrintWindow(pdfContent || mdContent, pdfTitle || "K-Storm");
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button className="icon-button" disabled={disabled} onClick={() => setOpen(!open)} style={{ whiteSpace: "nowrap" }}>
        {icon || <Download size={16} />}
        <span>{label || "下载"}</span>
      </button>
      {open ? (
        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--panel-strong)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, minWidth: 140 }}>
          <button onClick={handleMD} style={{ display: "block", width: "100%", border: "none", background: "transparent", padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "var(--ink)", textAlign: "left" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel-muted)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>Markdown (.md)</button>
          <button onClick={handlePDF} style={{ display: "block", width: "100%", border: "none", background: "transparent", padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "var(--ink)", textAlign: "left", borderTop: "1px solid var(--border)" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel-muted)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>PDF (.pdf)</button>
        </div>
      ) : null}
    </div>
  );
}

export default DownloadMenu;
