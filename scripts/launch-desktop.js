import { appendFileSync, closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientMode = process.argv.includes("--client");
const logPath = path.join(rootDir, "data", clientMode ? "launcher-join.log" : "launcher.log");
const electronLogPath = path.join(rootDir, "data", clientMode ? "electron-join.log" : "electron.log");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const electronBinary = process.platform === "win32"
  ? path.join(rootDir, "node_modules", "electron", "dist", "electron.exe")
  : path.join(rootDir, "node_modules", ".bin", "electron");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, line, "utf8");
  } catch {
    // Last-ditch launcher logging should never prevent launch.
  }
}

process.on("uncaughtException", (error) => {
  log(`uncaughtException: ${error?.stack || error}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection: ${error?.stack || error}`);
  process.exit(1);
});

log(`starting launcher mode=${clientMode ? "client" : "host"} node=${process.execPath}`);

if (!existsSync(viteBin)) {
  log(`missing vite: ${viteBin}`);
  console.error("Vite was not found. Run npm install, then try again.");
  process.exit(1);
}

const build = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: rootDir,
  stdio: "inherit",
  windowsHide: true,
});

if (build.status !== 0) {
  log(`vite build failed status=${build.status ?? "unknown"} signal=${build.signal ?? ""}`);
  process.exit(build.status ?? 1);
}

if (!existsSync(electronBinary)) {
  log(`missing electron: ${electronBinary}`);
  console.error("Electron binary was not found. Run npm install, then try again.");
  process.exit(1);
}

const electronArgs = clientMode ? [".", "--client"] : ["."];
log(`launching electron=${electronBinary} args=${electronArgs.join(" ")}`);
let electronLogFd = null;
try {
  mkdirSync(path.dirname(electronLogPath), { recursive: true });
  electronLogFd = openSync(electronLogPath, "a");
} catch (error) {
  log(`electron log unavailable: ${error?.message || error}`);
}
const child = spawn(electronBinary, electronArgs, {
  cwd: rootDir,
  detached: true,
  env: {
    ...process.env,
    LOREKEEPER_NODE: process.execPath,
  },
  stdio: electronLogFd === null ? "ignore" : ["ignore", electronLogFd, electronLogFd],
  windowsHide: true,
});
if (electronLogFd !== null) {
  closeSync(electronLogFd);
}

child.on("error", (error) => {
  log(`electron spawn error: ${error?.stack || error}`);
  process.exit(1);
});

log(`electron spawned pid=${child.pid ?? "unknown"}`);
child.unref();
