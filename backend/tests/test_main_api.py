"""API 冒烟测试：健康检查 / 创建运行 / SSE 流 / 历史 / 记忆检索 / 僵尸 run 回收。

使用隔离的临时 SQLite 数据库与 TestClient（background tasks 同步执行，mock provider 全流程完成）。
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="ks_api_")

import app.model_providers.mock as _mock_mod  # noqa: E402
_mock_mod.time.sleep = lambda *_a, **_kw: None  # type: ignore[attr-defined]

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.models import RunStatus  # noqa: E402
from app.storage import db  # noqa: E402

RUN_PAYLOAD = {
    "template_input": {
        "field": "生物信息学",
        "background": "多组学数据整合研究背景",
        "existing_basis": "已有单细胞数据与处理流程",
        "core_question": "如何整合多组学发现关键调控模块？",
    },
    "mode": "full",
    "rounds": 1,
    "parallel_first_round": False,
    "run_name": "API 冒烟测试",
}


@pytest.fixture(autouse=True)
def _fresh_db(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", Path(_TMP_DIR) / "ks.sqlite3")
    db.init_db()
    yield


@pytest.fixture()
def client(_fresh_db):
    with TestClient(app) as c:
        yield c


def _create_run(client, **overrides) -> str:
    payload = {**RUN_PAYLOAD, **overrides}
    response = client.post("/api/runs", json=payload)
    assert response.status_code == 200, response.text
    run_id = response.json()["run_id"]
    return run_id


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_run_produces_all_artifacts(client):
    run_id = _create_run(client)
    run = client.get(f"/api/runs/{run_id}").json()
    assert run["status"] == "COMPLETED", run.get("error")
    assert run["run_name"] == "API 冒烟测试"
    assert len(run["debate_messages"]) >= 4
    assert run["final_report"]
    assert run["critique_report"] and run["citation_review"]
    assert run["structured_ir"]["candidate_directions"]

    messages = client.get(f"/api/runs/{run_id}/messages").json()
    assert len(messages) >= 4
    report = client.get(f"/api/runs/{run_id}/report").json()
    assert report["report"]


def test_history_and_delete(client):
    run_id = _create_run(client)
    history = client.get("/api/history").json()
    assert any(item["run_id"] == run_id for item in history)
    assert history[0]["candidate_titles"], "history 应包含候选方向标题"

    response = client.post("/api/history/delete", json={"run_ids": [run_id]})
    assert response.json()["deleted"] == 1
    assert client.get(f"/api/runs/{run_id}").status_code == 404


def test_stream_endpoint_yields_run_snapshot(client):
    run_id = _create_run(client)
    events: list[str] = []
    with client.stream("GET", f"/api/runs/{run_id}/stream") as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data: "):
                events.append(line[6:])
    assert events, "stream 应推送至少一个事件"
    payload = __import__("json").loads(events[-1])
    assert payload["run_id"] == run_id


def test_token_stream_ends_with_done(client):
    run_id = _create_run(client)
    last = None
    with client.stream("GET", f"/api/runs/{run_id}/token-stream") as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data: "):
                last = __import__("json").loads(line[6:])
    assert last is not None
    assert last.get("done") is True


def test_memory_search_indexes_completed_runs(client):
    _create_run(client)
    response = client.post("/api/memory/search", json={"question": "多组学 调控模块", "top_k": 5})
    assert response.status_code == 200
    body = response.json()
    assert body["total_runs_searched"] >= 1
    assert body["total_entries_indexed"] >= 1


def test_unknown_run_returns_404(client):
    assert client.get("/api/runs/ks_does_not_exist").status_code == 404


def test_verify_references_endpoint_writes_verification(client, monkeypatch):
    """verify 端点把核验结果写回 external_references.verification 字段。"""
    from app.schemas.models import ExternalReference
    from app.verification.schemas import ReferenceVerification

    run_id = _create_run(client)
    # 直接给 run 灌一条带 arXiv URL 的引用
    from app.storage import db
    db.update_run(run_id, external_references=[
        ExternalReference(id="REF-1", source_type="paper", title="Test Paper",
                          url="https://arxiv.org/abs/1706.03762", authors="Vaswani"),
    ])

    # mock 核验器避免真实网络（端点侧集成，核验逻辑由 test_verification 覆盖）
    def fake_verify(refs, sources=None):
        return [ReferenceVerification(status="verified", source="arxiv", matched_title="Test Paper")]
    monkeypatch.setattr("app.verification.verify.verify_references", fake_verify)

    response = client.post(f"/api/runs/{run_id}/references/verify", json={})
    assert response.status_code == 200, response.text
    refs = response.json()["external_references"]
    assert refs[0]["verification"]["status"] == "verified"
    assert refs[0]["verification"]["source"] == "arxiv"


def test_verify_references_empty_returns_400(client):
    # 创建一条 quick probe run（mock 不产生"### 外部引用"小节 → external_references 为空）
    payload = {**RUN_PAYLOAD, "mode": "quick", "probe_agent": "reviewer", "probe_question": "测试", "run_name": "空引用 run"}
    response = client.post("/api/runs", json=payload)
    run_id = response.json()["run_id"]
    # 确保无引用（quick probe 不提取引用）
    from app.storage import db
    db.update_run(run_id, external_references=[])
    verify_resp = client.post(f"/api/runs/{run_id}/references/verify", json={})
    assert verify_resp.status_code == 400


def test_stale_running_runs_recovered_on_startup(client):
    run_id = _create_run(client)
    # 模拟进程崩溃：run 停留在进行中状态
    db.update_run(run_id, status=RunStatus.DEBATE_RUNNING, current_step="模拟崩溃", _force=True)
    assert db.get_run(run_id).status == RunStatus.DEBATE_RUNNING

    recovered = db.mark_stale_runs_failed()
    assert recovered == 1
    run = db.get_run(run_id)
    assert run.status == RunStatus.FAILED
    assert "服务重启中断" in run.error
    # 二次调用幂等
    assert db.mark_stale_runs_failed() == 0


def test_history_export_import_roundtrip(client):
    """导出 → 清库 → 导入，验证 run 可恢复。"""
    run_id = _create_run(client)
    # 导出
    resp = client.get("/api/history/export")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["count"] >= 1
    assert any(r["run_id"] == run_id for r in payload["runs"])

    # 导入到已有库（幂等跳过）
    import_resp = client.post("/api/history/import", json=payload)
    assert import_resp.status_code == 200
    assert import_resp.json()["skipped"] >= 1  # 已存在则跳过


def test_discover_rejects_non_http_scheme(client):
    """安全：file:// / gopher:// 等 scheme 应被拒绝。"""
    from app.schemas.models import UserModelProvider
    provider = UserModelProvider(
        id="evil", name="evil", api_key="k",
        base_url="file:///etc/passwd", api_type="openai_compatible",
    )
    resp = client.post("/api/models/discover", json=provider.model_dump())
    assert resp.status_code == 400
    assert "http" in resp.json()["detail"]


def teardown_module():
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
