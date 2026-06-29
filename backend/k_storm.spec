# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for K-Storm backend server
# Run:  cd backend && pyinstaller k_storm.spec --clean

from PyInstaller.utils.hooks import collect_all, collect_submodules

# Packages whose hooks tend to drag in Qt bindings present in the conda/pip env.
# We strip Qt entries from collect_all() results so they never reach Analysis().
_QT_PREFIXES = (
    "PyQt5", "PyQt6", "PySide2", "PySide6",
    "qt5", "qt6", "Qt5", "Qt6",
    "pyqtgraph", "qtpy", "qtawesome",
)

def _drop_qt(items):
    """Remove Qt-related entries from datas/binaries/hiddenimports lists."""
    out = []
    for item in items:
        # datas/binaries are (src, dest) tuples; hiddenimports are strings
        name = item[0] if isinstance(item, tuple) else item
        if not any(name.startswith(p) or ("/" + p) in name or ("\\" + p) in name
                   for p in _QT_PREFIXES):
            out.append(item)
    return out

# Collect all uvicorn sub-packages (they use __import__ internally)
_uv_d, _uv_b, _uv_h = collect_all("uvicorn")
uvicorn_datas, uvicorn_binaries, uvicorn_hiddenimports = _drop_qt(_uv_d), _drop_qt(_uv_b), _drop_qt(_uv_h)

# Collect fastapi and pydantic (some validators are loaded dynamically)
_fa_d, _fa_b, _fa_h = collect_all("fastapi")
fastapi_datas, fastapi_binaries, fastapi_hiddenimports = _drop_qt(_fa_d), _drop_qt(_fa_b), _drop_qt(_fa_h)

_pd_d, _pd_b, _pd_h = collect_all("pydantic")
pydantic_datas, pydantic_binaries, pydantic_hiddenimports = _drop_qt(_pd_d), _drop_qt(_pd_b), _drop_qt(_pd_h)

a = Analysis(
    ["server_entry.py"],
    pathex=["."],
    binaries=uvicorn_binaries + fastapi_binaries + pydantic_binaries,
    datas=[
        # Embed the built frontend
        ("app/static", "static"),
        # Embed prompt files if any exist alongside the app
        ("app/prompts", "app/prompts"),
        # Include all app sub-packages as data so imports resolve in the bundle
        ("app", "app"),
    ] + uvicorn_datas + fastapi_datas + pydantic_datas,
    hiddenimports=[
        # uvicorn internals
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # App modules
        "app.main",
        "app.storage.db",
        "app.orchestrator.runner",
        "app.model_providers.factory",
        "app.model_providers.mock",
        "app.model_providers.compatible",
        "app.model_providers.openai_provider",
        "app.model_providers.router",
        "app.schemas.models",
        "app.agents.registry",
        "app.memory.engine",
        "app.memory.tfidf",
        "app.memory.extractor",
        # stdlib pieces that sometimes get missed
        "email.mime.text",
        "email.mime.multipart",
        "sqlite3",
        "multiprocessing.resource_tracker",
        "multiprocessing.popen_fork",
    ] + uvicorn_hiddenimports + fastapi_hiddenimports + pydantic_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Qt bindings — K-Storm doesn't use Qt; exclude both to avoid the
        # "multiple Qt bindings" error when both are present in the env.
        "PyQt5", "PyQt6", "PySide2", "PySide6",
        # Other heavy packages not needed at runtime
        "tkinter", "matplotlib", "numpy", "pandas", "PIL", "cv2",
        "scipy", "sklearn", "tensorflow", "torch",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="k-storm-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # keep True so server logs are visible; Electron hides the window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,      # None = native arch; set "universal2" for fat binary on Mac
    codesign_identity=None,
    entitlements_file=None,
)
