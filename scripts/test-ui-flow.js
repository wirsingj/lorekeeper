import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("Playwright is not installed. Run `npm install` to enable UI flow tests.");
  process.exit(0);
}

const tempDir = await mkdtemp(path.join(tmpdir(), "lorekeeper-ui-flow-"));
const token = "ui-flow-secret";
let child;
let browser;
let browserReady = true;

try {
  child = spawn(process.execPath, ["./scripts/serve.js", "0"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOREKEEPER_PROJECT_ROOT: tempDir,
      LOREKEEPER_API_TOKEN: token,
      LOREKEEPER_BIND_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await waitForServerPort(child);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    console.log("Playwright Chromium is not installed. Run `npx playwright install chromium` to enable UI flow tests.");
    console.log(error instanceof Error ? error.message.split("\n")[0] : String(error));
    browserReady = false;
  }

  if (browserReady) {
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log(`[browser console] ${message.text()}`);
      }
    });
    await page.goto(`${baseUrl}/?lkToken=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#home-panel", { timeout: 10000 });
    await expectVisibleText(page, "Start Playing");
    await expectVisibleText(page, "New Adventure");

    const diagnostics = await fetchJson(`${baseUrl}/api/diagnostics?full=1`, {
      headers: { "x-lorekeeper-api-token": token },
    });
    if (!diagnostics.observability?.serverTrace?.events?.some((event) => event.detail?.path === "/api/diagnostics")) {
      throw new Error("Expected diagnostics request in server trace.");
    }

    console.log("UI flow smoke passed");
  }
} finally {
  if (browser) await browser.close();
  if (child) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  await rm(tempDir, { recursive: true, force: true });
}

async function expectVisibleText(page, text) {
  const locator = page.getByText(text, { exact: false });
  await locator.first().waitFor({ state: "visible", timeout: 10000 });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function waitForServerPort(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}
