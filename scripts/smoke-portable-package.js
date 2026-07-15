import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = path.join(rootDir, "dist", "portable", "LoreKeeper");
const packageExe = path.join(packageDir, "LoreKeeper.exe");
const smokeToken = "portable-smoke-token";

if (!existsSync(packageExe)) {
  console.error(`Portable executable is missing: ${relative(packageExe)}`);
  console.error("Run `npm run package:portable`, then retry the smoke test.");
  process.exit(1);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lorekeeper-portable-smoke-"));
const tempPackage = path.join(tempRoot, "LoreKeeper");
let child = null;

try {
  await cp(packageDir, tempPackage, { recursive: true });
  const tempExe = path.join(tempPackage, "LoreKeeper.exe");
  const tempApp = path.join(tempPackage, "resources", "app");
  child = spawn(tempExe, [path.join(tempApp, "scripts", "serve.js"), "0"], {
    cwd: tempApp,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LOREKEEPER_BIND_HOST: "127.0.0.1",
      LOREKEEPER_API_TOKEN: smokeToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const port = await waitForServerPort(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const runtime = await fetchJson(`${baseUrl}/api/runtime`, {
    headers: { "x-lorekeeper-api-token": smokeToken },
  });
  if (runtime.authRequired !== true || Number(runtime.port) !== port) {
    throw new Error(`Unexpected runtime smoke response: ${JSON.stringify(runtime)}`);
  }

  const unauthorized = await fetch(`${baseUrl}/api/runtime`);
  if (unauthorized.status !== 401) {
    throw new Error(`/api/runtime should reject missing token; got ${unauthorized.status}`);
  }

  const guest = await fetch(`${baseUrl}/guest`);
  const guestHtml = await guest.text();
  if (guest.status !== 200 || !guestHtml.includes("root")) {
    throw new Error(`/guest smoke failed: status=${guest.status} length=${guestHtml.length}`);
  }

  console.log(`LoreKeeper portable smoke passed: runtime ${runtime.port}, guest ${guest.status}.`);
} finally {
  await stopChild(child);
  await rm(tempRoot, { recursive: true, force: true });
}

function waitForServerPort(process) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error("Portable server did not report a port in time."));
    }, 12000);
    let stdout = "";
    let stderr = "";

    const onStdout = (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
      if (match) {
        cleanup();
        resolve(Number(match[1]));
      }
    };
    const onStderr = (chunk) => {
      stderr += String(chunk);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Portable server exited early with code ${code ?? "unknown"}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(deadline);
      process.stdout?.off("data", onStdout);
      process.stderr?.off("data", onStderr);
      process.off("exit", onExit);
      process.off("error", onError);
    };

    process.stdout?.on("data", onStdout);
    process.stderr?.on("data", onStderr);
    process.once("exit", onExit);
    process.once("error", onError);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function stopChild(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) {
    return;
  }
  const pid = childProcess.pid;
  childProcess.kill("SIGTERM");
  const stopped = await waitForExit(childProcess, 1500);
  if (stopped || childProcess.exitCode !== null || process.platform !== "win32" || !pid) {
    return;
  }
  await new Promise((resolve) => {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    }).once("exit", resolve).once("error", resolve);
  });
  await waitForExit(childProcess, 1500);
}

function waitForExit(childProcess, timeoutMs) {
  return new Promise((resolve) => {
    if (!childProcess || childProcess.exitCode !== null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      childProcess.off("exit", onExit);
    };
    childProcess.once("exit", onExit);
  });
}

function relative(target) {
  return path.relative(rootDir, target).replace(/\\/g, "/");
}
