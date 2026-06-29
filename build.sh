#!/usr/bin/env bash
# K-Storm one-click build script
# Usage:  bash build.sh
# Output: release/K-Storm-*.dmg  (macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
STATIC="$BACKEND/app/static"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       K-Storm Build Pipeline         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Step 1: Frontend ──────────────────────────────────────────────────────────
echo "▶ [1/4] Building frontend (Vite)…"
cd "$FRONTEND"
npm install --silent
npm run build
echo "  ✓ frontend/dist ready"

# ── Step 2: Copy dist → backend/app/static ───────────────────────────────────
echo "▶ [2/4] Copying dist → backend/app/static…"
rm -rf "$STATIC"
cp -r "$FRONTEND/dist" "$STATIC"
echo "  ✓ backend/app/static ready"

# ── Step 3: PyInstaller ───────────────────────────────────────────────────────
echo "▶ [3/4] Bundling backend (PyInstaller)…"
cd "$BACKEND"

# Install pyinstaller + runtime deps if not present
pip3 install --quiet pyinstaller uvicorn fastapi pydantic python-multipart h11 httptools

pyinstaller k_storm.spec --clean --noconfirm
echo "  ✓ backend/dist/k-storm-server ready"

# ── Step 4: Electron + electron-builder ──────────────────────────────────────
echo "▶ [4/4] Packaging with electron-builder…"
cd "$ROOT"
npm install --silent
npm run electron:build

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Build complete!  →  release/        ║"
echo "╚══════════════════════════════════════╝"
ls "$ROOT/release/"*.dmg 2>/dev/null || true
