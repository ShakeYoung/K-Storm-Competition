from __future__ import annotations

import asyncio
from pathlib import Path
import json
import logging
import os
import ssl
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

from fastapi import BackgroundTasks, Body, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.model_providers.compatible import normalize_openai_base_url
from app.model_providers.factory import get_model_provider
from app.orchestrator.runner import cancel_run, create_run_record, execute_memory_query, execute_run_safe, get_stream_state, rerun, resume_run_safe
from app.schemas.models import (
    DiscussionMode,
    HistoryDeleteRequest,
    HistoryItem,
    InterjectRequest,
    MemoryQueryRequest,
    MemoryQueryResponse,
    MemorySearchRequest,
    MemorySearchResponse,
    RunCreate,
    RunRecord,
    RunResumeRequest,
    UpgradeRequest,
    UserModelProvider,
)
from app.storage import db


def resolve_app_version() -> str:
    if os.environ.get("K_STORM_APP_VERSION"):
        return os.environ["K_STORM_APP_VERSION"]
    package_json = Path(__file__).resolve().parents[2] / "package.json"
    if package_json.exists():
        try:
            return json.loads(package_json.read_text(encoding="utf-8")).get("version", "0.0.0")
        except Exception:
            return "0.0.0"
    return "0.0.0"


APP_VERSION = resolve_app_version()

app = FastAPI(title="K-Storm API", version=APP_VERSION)

KNOWN_MODEL_PRESETS = {
    "ustc-107": [
        {"id": "deepseek-v4-pro", "name": "deepseek-v4-pro", "model": "deepseek-v4-pro"},
        {"id": "glm-5.2", "name": "glm-5.2", "model": "glm-5.2"},
        {"id": "deepseek-v4-flash", "name": "deepseek-v4-flash", "model": "deepseek-v4-flash"},
        {"id": "deepseek-v4-flash-ascend", "name": "deepseek-v4-flash-ascend", "model": "deepseek-v4-flash-ascend"},
        {"id": "qwen3.6-reasoner", "name": "qwen3.6-reasoner", "model": "qwen3.6-reasoner"},
        {"id": "qwen3.6-chat", "name": "qwen3.6-chat", "model": "qwen3.6-chat"},
        {"id": "qwen-reasoner", "name": "qwen-reasoner", "model": "qwen-reasoner"},
        {"id": "qwen-chat", "name": "qwen-chat", "model": "qwen-chat"},
        {"id": "smart/default", "name": "smart/default", "model": "smart/default"},
        {"id": "smart/reasoning", "name": "smart/reasoning", "model": "smart/reasoning"},
    ],
    "kimi-coding": [
        {"id": "kimi-for-coding", "name": "kimi-for-coding", "model": "kimi-for-coding"},
    ],
    "bailian-coding": [
        {"id": "qwen3.5-plus", "name": "qwen3.5-plus", "model": "qwen3.5-plus"},
        {"id": "kimi-k2.5", "name": "kimi-k2.5", "model": "kimi-k2.5"},
        {"id": "glm-5", "name": "glm-5", "model": "glm-5"},
        {"id": "MiniMax-M2.5", "name": "MiniMax-M2.5", "model": "MiniMax-M2.5"},
        {"id": "qwen3-coder-plus", "name": "qwen3-coder-plus", "model": "qwen3-coder-plus"},
        {"id": "qwen3-coder-next", "name": "qwen3-coder-next", "model": "qwen3-coder-next"},
        {"id": "glm-4.7", "name": "glm-4.7", "model": "glm-4.7"},
    ],
    "volcengine-coding": [
        {"id": "ark-code-latest", "name": "ark-code-latest", "model": "ark-code-latest"},
        {"id": "doubao-seed-2.0-code", "name": "doubao-seed-2.0-code", "model": "doubao-seed-2.0-code"},
        {"id": "doubao-seed-2.0-pro", "name": "doubao-seed-2.0-pro", "model": "doubao-seed-2.0-pro"},
        {"id": "doubao-seed-2.0-lite", "name": "doubao-seed-2.0-lite", "model": "doubao-seed-2.0-lite"},
        {"id": "deepseek-v3.2", "name": "deepseek-v3.2", "model": "deepseek-v3.2"},
        {"id": "kimi-k2.5", "name": "kimi-k2.5", "model": "kimi-k2.5"},
        {"id": "minimax-m2.5", "name": "minimax-m2.5", "model": "minimax-m2.5"},
        {"id": "glm-4.7", "name": "glm-4.7", "model": "glm-4.7"},
    ],
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os as _os
_static_env = _os.environ.get("K_STORM_STATIC_DIR")
STATIC_DIR = Path(_static_env) if _static_env else Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
ASSETS_DIR = STATIC_DIR / "assets"
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.on_event("startup")
def startup() -> None:
    db.init_db()
    recovered = db.mark_stale_runs_failed()
    if recovered:
        logger.info("recovered %d stale runs from previous process (marked FAILED)", recovered)
    seeded = db.seed_demo_runs()
    if seeded:
        logger.info("seeded %d demo runs for competition showcase", seeded)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": APP_VERSION}


@app.post("/api/models/discover")
def discover_models(provider: UserModelProvider) -> dict[str, list[dict[str, str]]]:
    if provider.id in KNOWN_MODEL_PRESETS:
        return {"models": KNOWN_MODEL_PRESETS[provider.id]}

    if provider.api_type not in {"openai_compatible", "openai_responses", "anthropic_messages"}:
        raise HTTPException(status_code=400, detail=f"暂不支持读取该 API 类型：{provider.api_type}")
    if not provider.api_key or not provider.base_url:
        raise HTTPException(status_code=400, detail="API Key 和 Base URL 不能为空")
    # 安全收口：拒绝非 http(s) scheme（防 SSRF，如 file:/// gopher:// 等）
    lowered = provider.base_url.lower().strip()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        raise HTTPException(status_code=400, detail="Base URL 必须以 http:// 或 https:// 开头")

    if provider.api_type in {"openai_compatible", "openai_responses"}:
        base_url = normalize_openai_base_url(provider.base_url)
    else:
        base_url = provider.base_url.rstrip("/")
    if base_url.endswith("/messages"):
        base_url = base_url[: -len("/messages")]
    endpoint = f"{base_url}/models"
    request = urllib.request.Request(
        endpoint,
        headers={
            **(
                {"x-api-key": provider.api_key, "anthropic-version": "2023-06-01"}
                if provider.api_type == "anthropic_messages"
                else {"Authorization": f"Bearer {provider.api_key}"}
            ),
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        context = ssl._create_unverified_context() if provider.allow_insecure_tls else None
        with urllib.request.urlopen(request, timeout=45, context=context) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"读取模型失败：{detail}") from exc
    except urllib.error.URLError as exc:
        detail = format_connection_error(exc.reason)
        raise HTTPException(status_code=502, detail=detail) from exc

    models = []
    for item in data.get("data", []):
        model_id = item.get("id")
        if model_id:
            models.append({"id": model_id, "name": model_id, "model": model_id})
    return {"models": models}


def format_connection_error(reason: object) -> str:
    if isinstance(reason, ssl.SSLCertVerificationError):
        return (
            "无法连接供应商：TLS 证书校验失败。通常是代理/公司网络使用了自签名证书、"
            "证书链不完整，或 Base URL 被中间层改写。请检查 Base URL、网络代理和系统证书。"
        )
    text = str(reason)
    if "CERTIFICATE_VERIFY_FAILED" in text or "self-signed certificate" in text:
        return (
            "无法连接供应商：TLS 证书校验失败。通常是代理/公司网络使用了自签名证书、"
            "证书链不完整，或 Base URL 被中间层改写。请检查 Base URL、网络代理和系统证书。"
        )
    return f"无法连接供应商：{text}"


@app.get("/")
def index() -> FileResponse:
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Static UI not found")
    return FileResponse(index_file)


@app.post("/api/runs", response_model=RunRecord)
def create_run(payload: RunCreate, background_tasks: BackgroundTasks) -> RunRecord:
    provider = get_model_provider(payload.model_settings)
    run = create_run_record(payload)
    logger.info("created run %s mode=%s provider=%s", run.run_id, payload.mode, provider.__class__.__name__)
    if payload.mode.value != "memory" or payload.source_run_id:
        background_tasks.add_task(
            execute_run_safe,
            run,
            payload.rounds,
            provider,
            payload.documents,
            payload.parallel_first_round,
            payload.mode,
            payload.selected_agents,
            payload.probe_agent,
            payload.probe_question,
        )
    return run


@app.get("/api/runs/{run_id}", response_model=RunRecord)
def get_run(run_id: str) -> RunRecord:
    try:
        return db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@app.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request) -> StreamingResponse:
    """SSE 端点：run 状态或消息数量变化时推送完整 run 快照。
    不设固定时长上限：run 进入终态或客户端断开时结束。
    """
    terminal = {"COMPLETED", "FAILED", "CANCELED"}

    async def _gen():
        prev_hash = None
        while True:
            if await request.is_disconnected():
                return
            try:
                run = db.get_run(run_id)
            except KeyError:
                yield f"data: {json.dumps({'error': 'not_found'}, ensure_ascii=False)}\n\n"
                return

            msg_count = len(run.debate_messages or [])
            h = f"{run.status}|{run.current_step}|{msg_count}"
            if h != prev_hash:
                prev_hash = h
                yield f"data: {run.model_dump_json()}\n\n"

            if run.status in terminal:
                return

            await asyncio.sleep(0.8)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/runs/{run_id}/token-stream")
async def token_stream(run_id: str, request: Request) -> StreamingResponse:
    """SSE 端点：推送当前正在生成的 agent 的逐字 token 流。
    每 100 ms 检查一次 buffer；buffer 内容变化时才推送，减少空推。
    run 进入终态时发送 {done: true} 并关闭流；客户端断开时直接结束。
    """
    terminal = {"COMPLETED", "FAILED", "CANCELED"}

    async def _gen():
        prev_partial = None
        while True:
            if await request.is_disconnected():
                return
            try:
                run = db.get_run(run_id)
            except KeyError:
                return

            state = get_stream_state(run_id)
            partial = state.get("partial", "")

            if partial != prev_partial:
                prev_partial = partial
                yield f"data: {json.dumps(state, ensure_ascii=False)}\n\n"

            if run.status in terminal:
                # 最后再发一次（可能刚清 buffer）
                final_state = get_stream_state(run_id)
                yield f"data: {json.dumps({**final_state, 'done': True}, ensure_ascii=False)}\n\n"
                return

            await asyncio.sleep(0.1)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/runs/{run_id}/messages")
def get_messages(run_id: str):
    try:
        return db.get_run(run_id).debate_messages
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@app.get("/api/runs/{run_id}/report")
def get_report(run_id: str) -> dict[str, str]:
    try:
        run = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    return {"run_id": run.run_id, "report": run.final_report}


@app.post("/api/runs/{run_id}/rerun", response_model=RunRecord)
def rerun_run(run_id: str) -> RunRecord:
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    return rerun(source, get_model_provider(source.model_settings))


@app.post("/api/runs/{run_id}/upgrade", response_model=RunRecord)
def upgrade_run(run_id: str, payload: UpgradeRequest, background_tasks: BackgroundTasks) -> RunRecord:
    """将已完成的 Quick Probe / Focused Panel 升级为更完整的讨论模式，历史上下文自动携带。"""
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    if source.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="只有已完成的运行可以升级")
    valid_upgrades: dict[str, list[DiscussionMode]] = {
        "quick":   [DiscussionMode.FOCUSED_PANEL, DiscussionMode.FULL_DELIBERATION],
        "focused": [DiscussionMode.FULL_DELIBERATION],
    }
    if payload.target_mode not in valid_upgrades.get(source.mode, []):
        raise HTTPException(status_code=400, detail=f"不支持从 {source.mode} 升级到 {payload.target_mode}")
    model_settings = payload.model_settings or source.model_settings
    src_name = source.run_name or source.run_id[:8]
    mode_label = {"focused": "聚焦研讨", "full": "完整讨论"}.get(payload.target_mode, payload.target_mode)
    new_payload = RunCreate(
        template_input=source.template_input,
        documents=source.documents,
        mode=payload.target_mode,
        rounds=payload.rounds,
        parallel_first_round=False,
        selected_agents=payload.selected_agents,
        model_settings=model_settings,
        upgrade_from_run_id=run_id,
        run_name=f"[升级→{mode_label}] {src_name}",
    )
    provider = get_model_provider(model_settings)
    run = create_run_record(new_payload)
    background_tasks.add_task(
        execute_run_safe,
        run,
        payload.rounds,
        provider,
        source.documents,
        False,
        payload.target_mode,
        payload.selected_agents,
        "",
        "",
    )
    return run


@app.post("/api/runs/{run_id}/cancel", response_model=RunRecord)
def cancel_existing_run(run_id: str) -> RunRecord:
    try:
        return cancel_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@app.post("/api/runs/{run_id}/resume", response_model=RunRecord)
def resume_existing_run(run_id: str, payload: RunResumeRequest, background_tasks: BackgroundTasks) -> RunRecord:
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    if source.status not in {"FAILED", "CANCELED"}:
        raise HTTPException(status_code=400, detail="只有失败或已停止的运行可以继续分析")
    provider = get_model_provider(payload.model_settings)
    updated = db.update_run(
        run_id,
        rounds=payload.rounds,
        parallel_first_round=payload.parallel_first_round,
        model_settings=db.sanitized_model_settings(payload.model_settings),
        error="",
        current_step="准备从失败位置继续",
        _force=True,
    )
    background_tasks.add_task(
        resume_run_safe,
        updated,
        payload.rounds,
        provider,
        payload.parallel_first_round,
    )
    return updated


@app.post("/api/runs/{run_id}/interject", response_model=RunRecord)
def interject(run_id: str, payload: InterjectRequest) -> RunRecord:
    """在指定轮次后追加一条人工意见（DebateMessage, is_human=True）。

    运行中的 run：下一轮 agent 会通过 run_debate_round_serial 的 DB 重拉看到该意见。
    已完成的 run：仅追加到历史，不影响已生成的报告（如需重新生成下游，用 resume）。
    """
    from app.schemas.models import DebateMessage
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    # 防御：同一轮避免重复插入完全相同的人工意见（幂等）
    new_msg = DebateMessage(
        round=payload.round,
        agent="你",
        title=f"用户意见（第 {payload.round} 轮后）",
        content=payload.content,
        model_label="用户意见",
        is_human=True,
    )
    messages = list(source.debate_messages or [])
    if any(m.is_human and m.round == payload.round and m.content == payload.content for m in messages):
        return source  # 已存在相同意见，幂等返回
    messages.append(new_msg)
    return db.update_run(run_id, debate_messages=messages)


@app.post("/api/runs/{run_id}/references")
def regenerate_references(run_id: str, payload: dict | None = Body(default=None)) -> RunRecord:
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    from app.orchestrator.runner import extract_references
    merge = (payload or {}).get("merge", False)
    existing = source.external_references if merge else None
    external_references = extract_references(source.debate_messages, existing)
    return db.update_run(run_id, external_references=external_references)


@app.post("/api/runs/{run_id}/references/verify")
def verify_references_endpoint(run_id: str, background_tasks: BackgroundTasks, payload: dict | None = Body(default=None)) -> dict:
    """异步核验：启动后台任务，立即返回进度句柄。前端轮询同端点（GET）查进度。
    已核验的引用会缓存（verification 字段非空且非 pending/skipped 时跳过）。
    """
    try:
        source = db.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    refs = list(source.external_references or [])
    if not refs:
        raise HTTPException(status_code=400, detail="该 Run 暂无外部引用，请先提取引用")
    sources_filter = (payload or {}).get("sources")
    sources_list = sources_filter.split(",") if isinstance(sources_filter, str) else None

    # 已有进行中任务则返回当前进度，避免重复启动
    state = _get_verify_state(run_id)
    if state.get("status") == "running":
        return {"run_id": run_id, **state}

    # 筛选需要核验的引用（跳过已 verified/mismatch/not_found 的缓存）
    need_verify = [r for r in refs if not r.verification or r.verification.get("status") in (None, "pending", "skipped")]
    if not need_verify:
        cached = sum(1 for r in refs if r.verification and r.verification.get("status") not in (None, "pending", "skipped"))
        return {"run_id": run_id, "status": "completed", "total": len(refs), "done": len(refs), "cached": cached, "detail": "所有引用均已核验"}

    _set_verify_state(run_id, {"status": "running", "total": len(refs), "done": len(refs) - len(need_verify), "cached": len(refs) - len(need_verify)})
    background_tasks.add_task(_run_verification_task, run_id, sources_list)
    return {"run_id": run_id, "status": "running", "total": len(refs), "done": len(refs) - len(need_verify), "cached": len(refs) - len(need_verify)}


@app.get("/api/runs/{run_id}/references/verify")
def get_verify_progress(run_id: str) -> dict:
    """轮询核验进度。任务完成后返回最新 external_references 快照。"""
    state = _get_verify_state(run_id)
    if state.get("status") != "running":
        # 已完成或无任务：返回当前引用的核验摘要
        try:
            run = db.get_run(run_id)
            refs = run.external_references or []
            verified = sum(1 for r in refs if r.verification and r.verification.get("status") == "verified")
            pending = sum(1 for r in refs if not r.verification or r.verification.get("status") in (None, "pending", "skipped"))
            return {"run_id": run_id, "status": state.get("status", "idle"), "total": len(refs), "done": len(refs), "verified": verified, "pending": pending}
        except KeyError:
            raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, **state}


# ── 核验任务状态（进程内，仿 streaming buffer 范式）──────────────────────────
_VERIFY_STATES: dict[str, dict] = {}


def _get_verify_state(run_id: str) -> dict:
    return dict(_VERIFY_STATES.get(run_id, {"status": "idle"}))


def _set_verify_state(run_id: str, state: dict) -> None:
    _VERIFY_STATES[run_id] = state


def _run_verification_task(run_id: str, sources_list: list[str] | None) -> None:
    """后台串行核验任务，每条完成后立即写回 DB + 更新进度。"""
    from app.verification.verify import verify_references
    try:
        run = db.get_run(run_id)
        refs = list(run.external_references or [])
        # 只核验未缓存的
        indices_to_verify = [i for i, r in enumerate(refs) if not r.verification or r.verification.get("status") in (None, "pending", "skipped")]
        done = len(refs) - len(indices_to_verify)
        for idx in indices_to_verify:
            verifications = verify_references([refs[idx]], sources=sources_list)
            if verifications:
                refs[idx].verification = verifications[0].model_dump()
            done += 1
            _set_verify_state(run_id, {"status": "running", "total": len(refs), "done": done})
            db.update_run(run_id, external_references=refs)
        _set_verify_state(run_id, {"status": "completed", "total": len(refs), "done": done})
    except Exception as exc:
        logger.exception("background verification failed for run %s: %s", run_id, exc)
        _set_verify_state(run_id, {"status": "failed", "detail": str(exc)})


@app.post("/api/documents/extract")
async def extract_documents(files: list[UploadFile] = File(...)) -> dict:
    """从 PDF / DOCX / TXT 文件中提取纯文本，供前端直接写入 documents.content。"""
    import io

    results = []
    for upload in files:
        filename = upload.filename or "unknown"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        data = await upload.read()
        text = ""
        error = ""
        try:
            if ext == "pdf":
                try:
                    import pdfplumber
                except ImportError:
                    raise RuntimeError("PDF 提取依赖未安装（pdfplumber），请在后端环境执行 pip install -r requirements.txt")
                with pdfplumber.open(io.BytesIO(data)) as pdf:
                    pages = []
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            pages.append(page_text)
                    text = "\n\n".join(pages)
            elif ext in {"docx", "doc"}:
                try:
                    from docx import Document as DocxDocument
                except ImportError:
                    raise RuntimeError("Word 文档提取依赖未安装（python-docx），请在后端环境执行 pip install -r requirements.txt")
                doc = DocxDocument(io.BytesIO(data))
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                text = "\n".join(paragraphs)
            else:
                # 纯文本 / Markdown / CSV 等
                text = data.decode("utf-8", errors="replace")
        except Exception as exc:
            error = str(exc)
            text = ""

        results.append({
            "name": filename,
            "ext": ext,
            "text": text,
            "chars": len(text),
            "error": error,
        })

    return {"results": results}


@app.get("/api/history", response_model=list[HistoryItem])
def history() -> list[HistoryItem]:
    return db.list_history()


@app.get("/api/history/location")
def history_location() -> dict[str, str]:
    return db.history_location()


@app.get("/api/history/export")
def export_history() -> dict:
    """导出全部历史 run 为 JSON（含完整产物），供备份/迁移使用。"""
    from app.storage import db as _db
    history = _db.list_history(limit=500)
    runs = []
    for item in history:
        try:
            run = _db.get_run(item.run_id)
            runs.append(json.loads(run.model_dump_json()))
        except Exception:
            continue
    return {
        "exported_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "version": APP_VERSION,
        "count": len(runs),
        "runs": runs,
    }


@app.post("/api/history/import")
def import_history(payload: dict = Body(...)) -> dict:
    """从 JSON 导入历史 run（用于换机迁移/恢复）。已存在的 run_id 跳过。"""
    from app.storage import db as _db
    from app.schemas.models import (
        AgentModelSettings,
        ExternalReference,
        RunRecord,
        StructuredBrief,
        StructuredIRV2,
        TemplateInput,
    )
    runs_data = payload.get("runs") or []
    imported = 0
    skipped = 0
    for data in runs_data:
        run_id = data.get("run_id")
        if not run_id:
            continue
        try:
            _db.get_run(run_id)
            skipped += 1
            continue
        except KeyError:
            pass
        try:
            template = TemplateInput.model_validate(data["template_input"])
            _db.create_run(
                run_id,
                template,
                model_settings=AgentModelSettings.model_validate(data.get("model_settings") or {}),
                rounds=data.get("rounds", 3),
                parallel_first_round=bool(data.get("parallel_first_round", False)),
                mode=data.get("mode", "full"),
                research_stage=data.get("research_stage", "auto"),
                run_name=data.get("run_name", ""),
            )
            update_kwargs = {
                "status": data.get("status", "COMPLETED"),
                "final_report": data.get("final_report", ""),
                "group_summary": data.get("group_summary", ""),
                "critique_report": data.get("critique_report", ""),
                "citation_review": data.get("citation_review", ""),
                "debate_messages": data.get("debate_messages", []),
                "external_references": [ExternalReference.model_validate(r) for r in data.get("external_references", [])],
            }
            if data.get("structured_brief"):
                update_kwargs["structured_brief"] = StructuredBrief.model_validate(data["structured_brief"])
            if data.get("structured_ir"):
                update_kwargs["structured_ir"] = StructuredIRV2.model_validate(data["structured_ir"])
            _db.update_run(run_id, **update_kwargs)
            imported += 1
        except Exception:
            continue
    return {"imported": imported, "skipped": skipped}


@app.post("/api/history/delete")
def delete_history(payload: HistoryDeleteRequest) -> dict[str, int]:
    return {"deleted": db.delete_runs(payload.run_ids)}


@app.post("/api/memory/search", response_model=MemorySearchResponse)
def memory_search(payload: MemorySearchRequest) -> MemorySearchResponse:
    """跨 Run TF-IDF 知识检索：从所有已完成的 Run 的 StructuredIRV2 中检索相关知识单元。
    支持可选的 LLM 查询扩展（默认开启），把原问题扩成同义检索词提升语义召回。
    """
    from app.memory.extractor import extract_memory_entries
    from app.memory.tfidf import search as tfidf_search
    from app.memory.query_expander import expand_query

    # 加载所有已完成 Run（最多 200 条，按更新时间倒序）
    history = db.list_history(limit=200)
    completed_ids = [h.run_id for h in history if h.status == "COMPLETED"]

    all_entries = []
    for run_id in completed_ids:
        try:
            run = db.get_run(run_id)
            all_entries.extend(extract_memory_entries(run))
        except Exception:
            continue

    # 查询扩展：把原问题扩成同义检索词（mock/离线自动降级为规则扩展）
    expanded = expand_query(payload.question, provider=None)
    all_queries = [payload.question] + expanded

    # 对每个 query 检索，合并结果按 entry_id 去重，分数取最大值
    merged: dict[str, dict] = {}
    for q in all_queries:
        hits = tfidf_search(
            query=q,
            entries=all_entries,
            top_k=payload.top_k * 2 if len(all_queries) > 1 else payload.top_k,
            field_filter=payload.field_filter,
            entry_types=payload.entry_types if payload.entry_types else None,
        )
        for hit in hits:
            eid = hit.entry.entry_id
            if eid not in merged or hit.score > merged[eid]["score"]:
                merged[eid] = {"hit": hit, "score": hit.score}

    hits = [v["hit"] for v in sorted(merged.values(), key=lambda x: x["score"], reverse=True)][:payload.top_k]

    return MemorySearchResponse(
        hits=hits,
        total_entries_indexed=len(all_entries),
        total_runs_searched=len(completed_ids),
        expanded_queries=expanded,
    )


@app.post("/api/memory/query", response_model=MemoryQueryResponse)
def memory_query(payload: MemoryQueryRequest) -> MemoryQueryResponse:
    try:
        source_run = db.get_run(payload.source_run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="源 Run 不存在") from exc
    if source_run.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="源 Run 尚未完成，无法作为记忆源")
    provider = get_model_provider(source_run.model_settings)
    answer = execute_memory_query(source_run, payload.question, payload.agent_key, provider)
    return MemoryQueryResponse(
        answer=answer,
        source_run_id=source_run.run_id,
        source_field=source_run.template_input.field,
        agent_key=payload.agent_key,
    )
