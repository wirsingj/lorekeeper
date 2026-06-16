import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(tmpdir(), "lorekeeper-server-"));
const token = "integration-secret";
let child;

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

  const runtime = await fetchJson(`${baseUrl}/api/runtime`);
  assert.equal(path.resolve(runtime.projectRoot), path.resolve(tempDir));
  assert.equal(runtime.authRequired, true);
  assert.equal(runtime.port, port);

  const unauthorized = await fetch(`${baseUrl}/api/campaign/player-notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: { scratch: "should not save" } }),
  });
  assert.equal(unauthorized.status, 401);

  const created = await fetchJson(`${baseUrl}/api/campaign/new`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify({
      title: "Integration Table",
      premise: "A route isolation test campaign.",
    }),
  });
  assert.equal(created.campaign.title, "Integration Table");

  const stale = await fetch(`${baseUrl}/api/campaign/player-notes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
      "x-lorekeeper-campaign-id": "wrong-campaign",
    },
    body: JSON.stringify({
      campaignId: created.campaign.id,
      notes: { scratch: "stale should be rejected" },
    }),
  });
  assert.equal(stale.status, 409);
  assert.match(await stale.text(), /Active campaign changed/);

  const saved = await fetchJson(`${baseUrl}/api/campaign/player-notes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
      "x-lorekeeper-campaign-id": created.campaign.id,
    },
    body: JSON.stringify({
      campaignId: created.campaign.id,
      notes: { scratch: "route integration saved" },
    }),
  });
  assert.equal(saved.campaign.playerNotes.scratch, "route integration saved");
} finally {
  if (child && !child.killed) {
    child.kill();
  }
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Lorekeeper server integration tests passed.");

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    assert.fail(await response.text());
  }
  return response.json();
}

function waitForServerPort(processHandle) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start. stdout=${stdout} stderr=${stderr}`));
    }, 10000);

    processHandle.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/Lorekeeper local app: http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    processHandle.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup with code ${code}. stdout=${stdout} stderr=${stderr}`));
    });
    processHandle.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
