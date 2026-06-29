"use strict";

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = 8000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${SERVER_URL}/api/health`;
const POLL_INTERVAL_MS = 400;
const POLL_RETRIES = 60;          // 24 s total before giving up

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let backendProcess = null;

// ── Backend binary path ───────────────────────────────────────────────────────
function getServerBinaryPath() {
  if (app.isPackaged) {
    // electron-builder places extraResources next to the app binary
    const bin = process.platform === "win32" ? "k-storm-server.exe" : "k-storm-server";
    return path.join(process.resourcesPath, bin);
  }
  // Dev mode: expect the PyInstaller output in backend/dist/
  const bin = process.platform === "win32" ? "k-storm-server.exe" : "k-storm-server";
  return path.join(__dirname, "..", "backend", "dist", bin);
}

// ── User data dir (passed to backend for DB persistence) ─────────────────────
function getUserDataDir() {
  return path.join(app.getPath("userData"), "data");
}

// ── Start the backend process ─────────────────────────────────────────────────
function startBackend() {
  const serverPath = getServerBinaryPath();
  const dataDir = getUserDataDir();

  console.log("[K-Storm] Starting backend:", serverPath);
  console.log("[K-Storm] Data dir:", dataDir);

  backendProcess = spawn(serverPath, [], {
    env: {
      ...process.env,
      K_STORM_PORT: String(PORT),
      K_STORM_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  backendProcess.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backendProcess.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));

  backendProcess.on("error", (err) => {
    console.error("[K-Storm] Backend spawn error:", err.message);
    dialog.showErrorBox(
      "K-Storm 启动失败",
      `后端进程无法启动：\n${err.message}\n\n请确认应用完整性。`
    );
    app.quit();
  });

  backendProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[K-Storm] Backend exited with code ${code}`);
    }
  });
}

// ── Poll until server is up ───────────────────────────────────────────────────
function waitForServer(retriesLeft) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      http
        .get(HEALTH_URL, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (n > 0) {
            setTimeout(() => attempt(n - 1), POLL_INTERVAL_MS);
          } else {
            reject(new Error(`Server health check failed (status ${res.statusCode})`));
          }
          res.resume(); // drain
        })
        .on("error", () => {
          if (n > 0) {
            setTimeout(() => attempt(n - 1), POLL_INTERVAL_MS);
          } else {
            reject(new Error("Backend did not respond in time."));
          }
        });
    }
    attempt(retriesLeft);
  });
}

// ── Create the main browser window ───────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "K-Storm",
    // Use the SVG icon (electron-builder handles .icns for the dock)
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,   // reveal only after content loads
    backgroundColor: "#f5f7ff",
  });

  // Open external links in system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  try {
    startBackend();
    await waitForServer(POLL_RETRIES);
    await mainWindow.loadURL(SERVER_URL);
    mainWindow.show();
  } catch (err) {
    console.error("[K-Storm] Startup error:", err.message);
    dialog.showErrorBox(
      "K-Storm 启动超时",
      `后端服务未能在规定时间内就绪。\n\n${err.message}`
    );
    app.quit();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  killBackend();
  // On macOS, keep the process alive until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

app.on("before-quit", killBackend);

function killBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log("[K-Storm] Stopping backend…");
    backendProcess.kill();
    backendProcess = null;
  }
}
