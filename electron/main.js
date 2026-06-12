import { Menu, app, BrowserWindow, shell } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.LOREKEEPER_PORT || 4173);
let apiProcess = null;
let mainWindow = null;

async function createWindow() {
  await startApiServer();
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 1080,
    minWidth: 1120,
    minHeight: 720,
    title: "LoreKeeper",
    backgroundColor: "#171a1d",
    webPreferences: {
      preload: path.join(rootDir, "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function startApiServer() {
  if (apiProcess) {
    return;
  }

  apiProcess = spawn(process.env.LOREKEEPER_NODE || "node", ["./scripts/serve.js", String(port)], {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  apiProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`LoreKeeper API exited with code ${code}`);
    }
    apiProcess = null;
  });

  await waitForApi();
}

async function waitForApi() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/campaign`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("LoreKeeper API did not start in time.");
}

app.whenReady().then(createWindow);

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

app.on("before-quit", () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
  }
});
