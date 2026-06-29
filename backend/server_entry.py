"""K-Storm server entry point — used by both direct launch and PyInstaller bundle."""
import os
import sys

# When bundled by PyInstaller, data files live under sys._MEIPASS.
# Tell the FastAPI app where to find the static frontend and where to write the DB.
if hasattr(sys, "_MEIPASS"):
    _base = sys._MEIPASS
    os.environ.setdefault("K_STORM_STATIC_DIR", os.path.join(_base, "static"))
    # Persist user data in ~/Library/Application Support/K-Storm on macOS,
    # or APPDATA\K-Storm on Windows, with a sensible Linux fallback.
    if sys.platform == "darwin":
        _data_dir = os.path.expanduser("~/Library/Application Support/K-Storm")
    elif sys.platform == "win32":
        _data_dir = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "K-Storm")
    else:
        _data_dir = os.path.expanduser("~/.local/share/K-Storm")
    os.makedirs(_data_dir, exist_ok=True)
    os.environ.setdefault("K_STORM_DATA_DIR", _data_dir)
    sys.path.insert(0, _base)

import uvicorn  # noqa: E402 — must come after sys.path tweak

if __name__ == "__main__":
    port = int(os.environ.get("K_STORM_PORT", "8000"))
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
