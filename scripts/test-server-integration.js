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

  const runtimeUnauthorized = await fetch(`${baseUrl}/api/runtime`);
  assert.equal(runtimeUnauthorized.status, 401);

  const runtime = await fetchJson(`${baseUrl}/api/runtime`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.equal(path.resolve(runtime.projectRoot), path.resolve(tempDir));
  assert.equal(runtime.authRequired, true);
  assert.equal(runtime.port, port);

  const traceUnauthorized = await fetch(`${baseUrl}/api/diagnostics/trace`);
  assert.equal(traceUnauthorized.status, 401);

  const trace = await fetchJson(`${baseUrl}/api/diagnostics/trace?full=1`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.equal(trace.redacted, false);
  assert.ok(trace.events.some((event) => event.type === "api.request" && event.detail.path === "/api/runtime"));

  const diagnosticsWithTrace = await fetchJson(`${baseUrl}/api/diagnostics?full=1`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.ok(diagnosticsWithTrace.observability.serverTrace.events.some((event) => event.detail.path === "/api/diagnostics/trace"));
  const traceAfterDiagnostics = await fetchJson(`${baseUrl}/api/diagnostics/trace?full=1`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.ok(traceAfterDiagnostics.events.some((event) => event.detail.path === "/api/diagnostics"));

  const draftLobby = await fetchJson(`${baseUrl}/api/pretable-lobby/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify({
      draftId: "draft-bar-fight",
      title: "Bar Fight 413",
      premise: "A tense tavern opening scene.",
      startingLocation: "Tavern",
      party: [
        { id: "party-bram", name: "Bram", ancestry: "Human", characterClass: "Cleric", controllerKind: "host" },
        { id: "party-tilli", name: "Tilli", ancestry: "Dwarf", characterClass: "Soldier", controllerKind: "remote_invite", inviteIntent: "remote_player" },
      ],
    }),
  });
  assert.equal(draftLobby.open, true);
  assert.match(draftLobby.guestLink, /^http:\/\/.+:\d+\/guest$/);
  assert.equal(draftLobby.joinableSeats[0].id, "party-tilli");

  const draftPreview = await fetchJson(`${baseUrl}/api/multiplayer/join-preview?campaign=old&table=old&session=old`);
  assert.equal(draftPreview.kind, "pre_table_lobby");
  assert.equal(draftPreview.campaignTitle, "Bar Fight 413");
  assert.equal(draftPreview.joinableSeats[0].name, "Tilli");

  const draftWait = await fetchJson(`${baseUrl}/api/multiplayer/waiting-room/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerName: "Jeff",
      clientId: "draft-client",
      preferredPartyMemberId: "party-tilli",
    }),
  });
  assert.equal(draftWait.campaignTitle, "Bar Fight 413");
  assert.equal(draftWait.waitingGuest.preferredPartyMemberId, "party-tilli");

  const draftSeat = await fetchJson(`${baseUrl}/api/pretable-lobby/seat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify({
      waitingGuestId: draftWait.waitingGuest.id,
      partyMemberId: "party-tilli",
    }),
  });
  assert.equal(draftSeat.waitingGuests[0].status, "seated");

  const reservedStatus = await fetchJson(`${baseUrl}/api/multiplayer/waiting-room/status?${new URLSearchParams({
    waitingGuestId: draftWait.waitingGuest.id,
    clientId: "draft-client",
    waitingSecret: draftWait.waitingSecret,
  })}`);
  assert.equal(reservedStatus.waitingGuest.status, "seated");
  assert.equal(reservedStatus.reservedSeat.name, "Tilli");

  const draftHostSnapshot = await fetchJson(`${baseUrl}/api/pretable-lobby/host-snapshot`, {
    headers: { "x-lorekeeper-api-token": token },
  });
  assert.equal(draftHostSnapshot.waitingGuests[0].displayName, "Jeff");

  await fetchJson(`${baseUrl}/api/pretable-lobby/close`, {
    method: "POST",
    headers: { "x-lorekeeper-api-token": token },
  });

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

  const seededParty = await fetchJson(`${baseUrl}/api/campaign/record`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
      "x-lorekeeper-campaign-id": created.campaign.id,
    },
    body: JSON.stringify({
      domain: "party",
      id: "party-starter-hero",
      name: "Starter Hero",
      type: "player_character",
      playerRole: "Remote player controlled",
      controllerKind: "unassigned",
      inviteIntent: "remote_player",
      ancestryClass: "Human Adventurer",
      level: 1,
      background: "Integration test party member.",
    }),
  });
  const activeSeatId = seededParty.campaign.party.find((member) => member.name === "Starter Hero").id;

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
  await fetchJson(`${baseUrl}/api/pretable-lobby/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify({
      draftId: "draft-market-debt",
      title: "Market Debt 139",
      premise: "The host is still building a party.",
      party: [
        { id: activeSeatId, name: "Starter Hero", ancestry: "Human", characterClass: "Adventurer", controllerKind: "remote_invite", inviteIntent: "remote_player" },
      ],
    }),
  });
  const draftSeatRequest = await fetchJson(`${baseUrl}/api/multiplayer/waiting-room/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerName: "Ada",
      clientId: "draft-client-after-start",
      preferredPartyMemberId: activeSeatId,
    }),
  });
  await fetchJson(`${baseUrl}/api/pretable-lobby/seat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify({
      waitingGuestId: draftSeatRequest.waitingGuest.id,
      partyMemberId: activeSeatId,
    }),
  });
  const adoptedLobby = await fetchJson(`${baseUrl}/api/pretable-lobby/adopt-active`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
      "x-lorekeeper-campaign-id": created.campaign.id,
    },
    body: JSON.stringify({
      campaignId: created.campaign.id,
      tableId: table.tableId,
      sessionId: table.sessionId,
    }),
  });
  const adoptedGuest = adoptedLobby.campaign.multiplayer.waitingGuests.find((guest) => guest.displayName === "Ada");
  assert.ok(adoptedGuest);
  assert.equal(adoptedGuest.tableId, table.tableId);
  assert.equal(adoptedGuest.sessionId, table.sessionId);
  assert.equal(adoptedGuest.preferredPartyMemberId, activeSeatId);
  assert.equal(adoptedGuest.status, "seated");
  assert.ok(adoptedGuest.connectionId);

  const adoptedStatus = await fetchJson(`${baseUrl}/api/multiplayer/waiting-room/status?${new URLSearchParams({
    waitingGuestId: draftSeatRequest.waitingGuest.id,
    clientId: "draft-client-after-start",
    waitingSecret: draftSeatRequest.waitingSecret,
    campaignId: "draft-market-debt",
    tableId: "draft-table-draft-market-debt",
    sessionId: "draft-session-draft-market-debt",
  })}`);
  assert.equal(adoptedStatus.campaignId, created.campaign.id);
  assert.equal(adoptedStatus.localTable.tableId, table.tableId);
  assert.equal(adoptedStatus.waitingGuest.displayName, "Ada");
  assert.equal(adoptedStatus.seated, true);
  assert.equal(adoptedStatus.connection.partyMemberId, activeSeatId);

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

console.log("LoreKeeper server integration tests passed.");

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
      const match = stdout.match(/LoreKeeper local app: http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
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
