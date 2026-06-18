import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildCampaignAdoptionPlan } from "../app/campaign-adoption-controller.js";
import { buildStagedInputRecoveryPlan, stagedInputRecoveryActions } from "../app/staged-input-recovery-controller.js";
import { buildProviderTaskRequest, acceptProviderResponseForTurn } from "../src/engine/provider-orchestrator.js";
import { buildTableDebugSnapshot } from "../src/engine/table-debug-snapshot.js";
import { buildTableSessionProjection, tablePhases } from "../src/engine/table-session-engine.js";
import {
  approveJoinRequest,
  createInviteForPartyMember,
  requestJoin,
  startLocalTable,
  submitGuestAction,
} from "../src/multiplayer/local-table.js";
import { parseTurnJsonResponse, validateTurnResponse, buildTurnRequestEnvelope } from "../src/model-contract/turn-json-contract.js";
import { createNewActiveCampaign, deleteCampaign } from "../src/storage/campaign-repository.js";

function campaignFixture() {
  return {
    id: "campaign-risk",
    title: "Regression Table",
    style: { tone: "tense but fair tabletop fantasy" },
    party: [
      {
        id: "thor",
        name: "Thor",
        controllerKind: "host",
        stats: { hp: { current: 12, max: 12 }, armorClass: 14, abilityScores: { STR: 16 } },
        attacks: [{ name: "Axe", attackBonus: 5, damage: "1d8+3" }],
      },
      {
        id: "mira",
        name: "Mira",
        controllerKind: "remote_player",
        controllerId: "player-mira",
        stats: { hp: { current: 9, max: 9 }, armorClass: 13, abilityScores: { DEX: 14 } },
      },
    ],
    people: [],
    places: [{ id: "road", name: "Old Road" }],
    items: [],
    quests: [],
    relationships: [],
    consequences: [],
    scene: {
      currentPlaceId: "road",
      immediateSituation: "A suspicious roadblock blocks the way.",
      presentPartyMemberIds: ["thor", "mira"],
    },
    sessionLog: { messages: [] },
    combat: {
      inCombat: false,
      round: null,
      currentTurnId: null,
      turnOrder: [],
      enemies: [],
    },
    multiplayer: {},
  };
}

function combatCampaignFixture() {
  return {
    ...campaignFixture(),
    combat: {
      inCombat: true,
      round: 1,
      currentTurnId: "thor",
      turnOrder: [
        { id: "thor", name: "Thor", type: "party", initiativeScore: 18 },
        { id: "wolf", name: "Wolf", type: "enemy", initiativeScore: 12 },
      ],
      enemies: [{ id: "wolf", name: "Wolf", hp: { current: 8, max: 8 }, armorClass: 12 }],
    },
  };
}

function baseResponse(overrides = {}) {
  return {
    type: "lorekeeper.turn.response",
    schemaVersion: 1,
    requestId: "risk-request",
    table: [{
      speaker: "DM",
      role: "dm",
      kind: "narration",
      visibility: "table",
      text: "The table waits for a clear ruling.",
    }],
    sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
    choices: { prompt: "", scope: "free", options: [] },
    mechanics: [],
    flags: {
      requiresReview: false,
      startsCombat: false,
      endsScene: false,
      containsSecretInfo: false,
    },
    proposedChanges: [],
    warnings: [],
    ...overrides,
  };
}

function testProviderRejectionDoesNotCarryStateChanges() {
  const parsed = parseTurnJsonResponse("not-json", { requestId: "risk-request" });
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.response.proposedChanges, []);
  assert.match(parsed.response.table[0].text, /No state changes were applied/);
}

function testGuestWrongTableOrSessionRejected() {
  let campaign = startLocalTable(campaignFixture(), {
    host: "0.0.0.0",
    port: 4173,
    tableId: "table-risk",
    sessionId: "session-current",
  });
  const inviteResult = createInviteForPartyMember(campaign, {
    partyMemberId: "mira",
    host: "127.0.0.1",
    port: 4173,
  });
  campaign = inviteResult.campaign;
  const join = requestJoin(campaign, {
    inviteLink: inviteResult.inviteLink,
    playerName: "Mira Player",
    clientId: "client-mira",
  });
  campaign = approveJoinRequest(join.campaign, join.connection.id);

  assert.throws(() => submitGuestAction(campaign, {
    connectionId: join.connection.id,
    clientId: "client-mira",
    connectionSecret: join.connectionSecret,
    characterId: "mira",
    text: "I watch the road.",
    campaignId: campaign.id,
    tableId: "table-risk",
    sessionId: "session-stale",
  }), /session is no longer active|fresh link/i);
}

function testControlledPcAgencyViolationRejected() {
  const request = buildTurnRequestEnvelope({
    campaign: campaignFixture(),
    contextPack: { sections: [] },
    playerTurn: "I wait and watch the road.",
    parsedMessage: { raw: "I wait and watch the road.", inWorldText: "I wait and watch the road.", playerInputs: [] },
    options: { requestId: "risk-request" },
  });
  const response = baseResponse({
    table: [{
      speaker: "DM",
      role: "dm",
      kind: "narration",
      visibility: "table",
      text: "Mira tightens her grip and steps forward, refusing to back down.",
    }],
  });
  const validation = validateTurnResponse(response, { expectedRequestId: "risk-request", request });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /controlled party member Mira/i);
}

function testCombatCannotAdvanceByNarrationAlone() {
  const request = buildTurnRequestEnvelope({
    campaign: combatCampaignFixture(),
    contextPack: { sections: [] },
    playerTurn: "Thor attacks the wolf.",
    parsedMessage: { raw: "Thor attacks the wolf.", inWorldText: "Thor attacks the wolf.", playerInputs: [] },
    options: { requestId: "risk-request", mode: "combat", responseMode: "resolve_combat" },
  });
  const response = baseResponse({
    sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
    table: [{
      speaker: "DM",
      role: "dm",
      kind: "narration",
      visibility: "table",
      text: "Thor lands a mighty blow and the battle moves on.",
    }],
    proposedChanges: [{
      operation: "update",
      domain: "combat",
      importance: "normal",
      visibility: "player_visible",
      summary: "Advance combat.",
      data: { turnResolved: true, advanceTurn: true, resolvedActorId: "thor" },
    }],
  });
  const validation = validateTurnResponse(response, { expectedRequestId: "risk-request", request });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /visible mechanics/i);
}

function testFailedProviderTurnKeepsStagedGuestInput() {
  const staged = [{ id: "input-1", text: "I guard the door.", characterName: "Mira" }];
  const plan = buildStagedInputRecoveryPlan({
    runResult: { providerReceived: true, imported: false, needsRepair: true },
    stagedRemoteInputs: staged,
    pendingInputs: staged,
  });
  assert.equal(plan.stagedRemote.action, stagedInputRecoveryActions.KEEP_STAGED);
  assert.equal(plan.pendingRemote.action, stagedInputRecoveryActions.KEEP_STAGED);
  assert.equal(plan.stagedRemote.inputs[0].id, "input-1");
}

function testProviderAndTableSessionIsolationHelpers() {
  assert.equal(
    acceptProviderResponseForTurn({ turnId: "turn-new" }, { turnId: "turn-old", narration: "late" }).accepted,
    false,
  );

  const campaign = {
    ...campaignFixture(),
    multiplayer: {
      localTable: { running: true, tableId: "table-risk", sessionId: "session-current" },
      pendingTurnInputs: [{ id: "input-1", text: "I help.", characterName: "Mira", ready: true }],
    },
  };
  const tableSession = buildTableSessionProjection({ campaign, multiplayer: campaign.multiplayer });
  assert.equal(tableSession.phase, tablePhases.WAITING_FOR_PLAYER);
  const snapshot = buildTableDebugSnapshot({
    campaign,
    tableSession,
    providerActivity: { state: "waiting", text: "DM idle" },
    recentErrors: [{ eventType: "provider_response_parse_error", message: "bad json" }],
  });
  assert.equal(snapshot.identity.campaignId, "campaign-risk");
  assert.equal(snapshot.identity.tableId, "table-risk");
  assert.equal(snapshot.multiplayer.stagedGuestInputs.length, 1);
  assert.equal(snapshot.lastErrors[0].eventType, "provider_response_parse_error");

  const request = buildProviderTaskRequest({
    task: "generate_scene_beat",
    campaign,
    turn: { turnId: "turn-risk", actorId: "mira" },
  });
  assert.equal(request.readonlyContext.activeActor.id, "mira");
  assert.equal(request.mutationPolicy.includes("Canonical state changes are app-owned"), true);
}

async function testRendererWiringForCampaignSwitchAndRetryBubble() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  assert.match(appJs, /buildCampaignAdoptionPlan/, "campaign switch reset policy should be extracted from renderer glue");
  const switchPlan = buildCampaignAdoptionPlan({ previousCampaignId: "old", nextCampaignId: "new" });
  assert.equal(switchPlan.resetTurnCarryover, true);
  assert.equal(switchPlan.resetTurnFlow, true);
  assert.equal(switchPlan.turnFlowResetReason, "campaign_changed");
  assert.match(appJs, /markRepairTurnRetrying/, "Try Again should update the original player bubble first");
  assert.match(appJs, /updatePlayerTurnEchoLifecycle\(retryMessage\.id/, "Try Again should settle the same player bubble after retry");
}

async function testDeletedCampaignFilesAreRecycled() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "lk-risk-repo-"));
  try {
    const first = await createNewActiveCampaign(repoRoot, {
      title: "Keep Campaign",
      premise: "This campaign should remain.",
    });
    const deleted = await createNewActiveCampaign(repoRoot, {
      title: "Recycle Campaign",
      premise: "This campaign should be recycled.",
    });
    const afterDelete = await deleteCampaign(repoRoot, { sqlitePath: deleted.sqlitePath });
    assert.equal(existsSync(deleted.sqlitePath), false);
    assert.ok(afterDelete.deletedCampaignBackup?.directory);
    assert.ok(afterDelete.deletedCampaignBackup.files.some((filePath) => path.basename(filePath) === path.basename(deleted.sqlitePath)));
    assert.equal(afterDelete.campaign.id, first.campaign.id);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

testProviderRejectionDoesNotCarryStateChanges();
testGuestWrongTableOrSessionRejected();
testControlledPcAgencyViolationRejected();
testCombatCannotAdvanceByNarrationAlone();
testFailedProviderTurnKeepsStagedGuestInput();
testProviderAndTableSessionIsolationHelpers();
await testRendererWiringForCampaignSwitchAndRetryBubble();
await testDeletedCampaignFilesAreRecycled();

console.log("high-risk regression pack passed");
