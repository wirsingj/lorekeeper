import { Menu, app, BrowserWindow, clipboard, ipcMain, screen, shell } from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const preferredPort = Number(process.env.LOREKEEPER_PORT || 4173);
let apiPort = preferredPort;
const executableName = path.basename(process.execPath);
const packagedThinDefault = /thinlorekeeper/i.test(`${app.getName()} ${executableName}`);
const clientMode = process.argv.includes("--client") || process.env.LOREKEEPER_CLIENT_MODE === "1" || packagedThinDefault;
const appName = clientMode ? "ThinLoreKeeper" : "LoreKeeper";
const appDisplayName = clientMode ? "ThinLoreKeeper" : "LoreKeeper";
const appIconPath = path.join(rootDir, "assets", "brand", clientMode ? "lorekeeper-client-icon.ico" : "lorekeeper-icon.ico");
let apiProcess = null;
let mainWindow = null;
let quitting = false;
let cleanupStarted = false;
const apiToken = crypto.randomBytes(24).toString("hex");

app.setName(appName);
app.setPath("userData", path.join(app.getPath("appData"), appName));

const singleInstanceLock = app.requestSingleInstanceLock({ mode: clientMode ? "client" : "host" });
if (!singleInstanceLock) {
  app.quit();
}

async function createWindow() {
  if (!clientMode) {
    await startApiServer();
  }
  Menu.setApplicationMenu(null);
  app.setAppUserModelId(appName);
  const windowBounds = preferredWindowBounds();

  mainWindow = new BrowserWindow({
    ...windowBounds,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: appDisplayName,
    icon: appIconPath,
    backgroundColor: "#171a1d",
    webPreferences: {
      preload: path.join(rootDir, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  mainWindow.once("ready-to-show", focusMainWindow);
  mainWindow.on("page-title-updated", (event) => {
    if (!clientMode) {
      return;
    }
    event.preventDefault();
    mainWindow.setTitle(appDisplayName);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererNavigation(url)) {
      event.preventDefault();
    }
  });
  setupRendererContextMenu(mainWindow);

  if (clientMode) {
    await mainWindow.loadFile(path.join(rootDir, "dist", "app", "index.html"), {
      query: { mode: "client" },
    });
    mainWindow.setTitle(appDisplayName);
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${apiPort}?lkToken=${encodeURIComponent(apiToken)}`);
  }
  focusMainWindow();
}

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ["https:", "http:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isAllowedRendererNavigation(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (clientMode) {
      return parsed.protocol === "file:";
    }
    return parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && Number(parsed.port) === apiPort;
  } catch {
    return false;
  }
}

function setupRendererContextMenu(window) {
  window.webContents.on("context-menu", (_event, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy || Boolean(params.selectionText) },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "delete", enabled: params.editFlags.canDelete },
        { type: "separator" },
        { role: "selectAll", enabled: params.editFlags.canSelectAll },
      );
    } else {
      template.push(
        { role: "copy", enabled: Boolean(params.selectionText?.trim()) },
        { role: "selectAll" },
      );
    }

    Menu.buildFromTemplate(template).popup({ window });
  });
}

function preferredWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(workArea.width, Math.max(1520, Math.floor(workArea.width * 0.9)));
  const height = Math.min(workArea.height, Math.max(1080, Math.floor(workArea.height * 0.9)));

  return {
    width,
    height,
    x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2)),
  };
}

async function startApiServer() {
  if (apiProcess) {
    return;
  }

  apiPort = await findAvailablePort(preferredPort);
  apiProcess = spawn(process.env.LOREKEEPER_NODE || "node", ["./scripts/serve.js", String(apiPort)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      LOREKEEPER_PARENT_PID: String(process.pid),
      LOREKEEPER_API_TOKEN: apiToken,
      LOREKEEPER_BIND_HOST: "0.0.0.0",
    },
  });

  apiProcess.stdout?.on("data", (chunk) => {
    console.log(`[api] ${String(chunk).trimEnd()}`);
  });
  apiProcess.stderr?.on("data", (chunk) => {
    console.error(`[api] ${String(chunk).trimEnd()}`);
  });
  apiProcess.on("exit", (code) => {
    if (!quitting && code && code !== 0) {
      console.error(`LoreKeeper API exited with code ${code}`);
    }
    apiProcess = null;
  });
  apiProcess.on("error", (error) => {
    console.error(`LoreKeeper API failed to start: ${error instanceof Error ? error.message : error}`);
    apiProcess = null;
  });

  await waitForApi();
}

async function waitForApi() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/runtime`);
      if (response.ok) {
        const runtime = await response.json();
        if (isOwnedApiRuntime(runtime)) {
          return;
        }
        throw new Error(`Port ${apiPort} is already used by another LoreKeeper API process.`);
      }
    } catch (error) {
      if (error instanceof Error && /already used/.test(error.message)) {
        throw error;
      }
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("LoreKeeper API did not start in time.");
}

async function findAvailablePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 20; candidate += 1) {
    if (await canBindLoopback(candidate)) {
      if (candidate !== startPort) {
        console.log(`Preferred API port ${startPort} is busy; using ${candidate}.`);
      }
      return candidate;
    }
  }
  throw new Error(`No available LoreKeeper API port found near ${startPort}.`);
}

function canBindLoopback(candidatePort) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(candidatePort, "127.0.0.1");
  });
}

function isOwnedApiRuntime(runtime) {
  if (!apiProcess) {
    return false;
  }
  const runtimeRoot = path.resolve(runtime.projectRoot || "");
  return runtimeRoot === rootDir
    && (Number(runtime.pid) === apiProcess.pid || Number(runtime.parentPid) === apiProcess.pid);
}

if (singleInstanceLock) {
  app.whenReady().then(createWindow).catch(async (error) => {
    console.error(error);
    await stopApiServer().catch((cleanupError) => {
      console.error(cleanupError);
    });
    app.quit();
  });
}

ipcMain.handle("lorekeeper:runtime-mode", () => ({
  mode: clientMode ? "thin" : "full",
  appName,
}));

ipcMain.handle("lorekeeper:clipboard-write-text", (_event, text) => {
  const value = String(text ?? "");
  if (!value || value.length > 200000) {
    return { ok: false, error: "Clipboard text is empty or too large." };
  }
  clipboard.writeText(value);
  return { ok: true };
});

ipcMain.handle("lorekeeper:clipboard-read-text", () => {
  const value = clipboard.readText();
  if (value.length > 500000) {
    return { ok: false, error: "Clipboard text is too large." };
  }
  return { ok: true, text: value };
});

ipcMain.handle("lorekeeper:relaunch-mode", (_event, requestedMode) => {
  const nextMode = requestedMode === "thin" ? "thin" : "full";
  if ((nextMode === "thin") === clientMode) {
    return { ok: true, mode: nextMode, relaunched: false };
  }

  const args = process.argv
    .slice(1)
    .filter((arg) => arg !== "--client");
  if (nextMode === "thin") {
    args.push("--client");
  }

  app.relaunch({ args });
  app.quit();
  return { ok: true, mode: nextMode, relaunched: true };
});

app.on("second-instance", () => {
  focusMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", (event) => {
  quitting = true;
  if (apiProcess && !cleanupStarted) {
    event.preventDefault();
    cleanupStarted = true;
    stopApiServer().finally(() => app.exit(0));
  }
});

function stopApiServer() {
  if (!apiProcess || apiProcess.killed) {
    return Promise.resolve();
  }
  const child = apiProcess;
  const pid = child.pid;
  return new Promise((resolve) => {
    const finish = () => resolve();
    child.once("exit", finish);
    child.kill("SIGTERM");
    if (process.platform === "win32" && pid) {
      setTimeout(() => {
        if (apiProcess && apiProcess.pid === pid) {
          spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
            stdio: "ignore",
            windowsHide: true,
          }).on("exit", finish);
        }
      }, 1500);
    }
    setTimeout(finish, 3000);
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();

  if (process.platform === "win32") {
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.setAlwaysOnTop(false);
      mainWindow.focus();
    }, 750);
  }
}
