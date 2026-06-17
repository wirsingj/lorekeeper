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

  const unauthLocalAsset = await fetch(`${baseUrl}/local-asset?path=${encodeURIComponent(path.join(process.cwd(), "package.json"))}`);
  assert.equal(unauthLocalAsset.status, 401);

  const forbiddenLocalAsset = await fetch(`${baseUrl}/local-asset?path=${encodeURIComponent(path.join(process.cwd(), "package.json"))}&lkToken=${encodeURIComponent(token)}`);
  assert.equal(forbiddenLocalAsset.status, 403);

  const traversalAsset = await fetch(`${baseUrl}/..%2Fpackage.json`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.notEqual(traversalAsset.status, 200, "built asset serving must not allow path traversal out of dist/app");

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

  const localTable = await fetchJson(`${baseUrl}/api/multiplayer/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
      "x-lorekeeper-campaign-id": created.campaign.id,
    },
    body: JSON.stringify({
      host: "127.0.0.1",
      port,
    }),
  });
  const table = localTable.campaign.multiplayer.localTable;
  assert.equal(table.running, true);
  assert.ok(table.tableId);
  assert.ok(table.sessionId);

  const wrongSessionAction = await fetch(`${baseUrl}/api/multiplayer/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      connectionId: "connection-from-old-table",
      clientId: "client-from-old-table",
      connectionSecret: "old-secret",
      characterId: "party-missing",
      text: "This should not reach the active table.",
      campaignId: created.campaign.id,
      tableId: table.tableId,
      sessionId: "session-from-old-link",
    }),
  });
  assert.equal(wrongSessionAction.status, 409);
  assert.match(await wrongSessionAction.text(), /session is no longer active/i);

  const wrongTableVote = await fetch(`${baseUrl}/api/multiplayer/choice-vote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      connectionId: "connection-from-old-table",
      clientId: "client-from-old-table",
      connectionSecret: "old-secret",
      choiceKey: "choice-key",
      optionId: "A",
      campaignId: created.campaign.id,
      tableId: "table-from-old-link",
      sessionId: table.sessionId,
    }),
  });
  assert.equal(wrongTableVote.status, 409);
  assert.match(await wrongTableVote.text(), /different table/i);

  const unauthHostCombatJoin = await fetch(`${baseUrl}/api/multiplayer/combat/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      partyMemberId: created.campaign.party?.[0]?.id || "party-host",
      campaignId: created.campaign.id,
      tableId: table.tableId,
      sessionId: table.sessionId,
    }),
  });
  assert.equal(unauthHostCombatJoin.status, 401);
  assert.match(await unauthHostCombatJoin.text(), /Host combat join requires local app authorization/);
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
