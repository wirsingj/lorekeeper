import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import {
  createNewActiveCampaign,
  deleteCampaign,
  listCampaigns,
} from "../src/storage/campaign-repository.js";
import {
  appendCampaignErrorToSqliteFile,
  readCampaignFromSqliteFile,
  readCampaignErrorsFromSqliteFile,
  readCampaignSqliteSummary,
  SQLITE_SCHEMA_VERSION,
  SQLITE_USER_VERSION,
  writeCampaignSqliteFile,
} from "../src/storage/sqlite-store.js";

const tempDir = await mkdtemp(path.join(tmpdir(), "lorekeeper-sqlite-"));

try {
  const campaign = createStarterCampaign({
    title: "SQLite 2 Campaign",
    premise: "A storage regression campaign.",
    startingLocation: "Schema Gate",
  });
  campaign.engineState.mode = "combat";
  campaign.scene.activeSceneId = "scene-1";
  campaign.scene.tensions = ["The gate is quiet, but too quiet."];
  campaign.scene.activeConsequenceIds = ["consequence-1"];
  campaign.scenes.push({
    id: "scene-1",
    title: "Schema Gate watch",
    type: "exploration",
    locationId: campaign.scene.currentPlaceId,
    participantIds: [campaign.party[0]?.id ?? "actor-1"],
    partyMemberIds: [campaign.party[0]?.id ?? "actor-1"],
    peopleIds: [],
    threadIds: [],
    consequenceIds: ["consequence-1"],
    goals: ["Keep watch."],
    tensions: ["The gate is quiet, but too quiet."],
    unresolvedQuestions: ["Who is testing the gate?"],
    whyHere: "The watch shift is the current pressure point.",
    immediateSituation: campaign.scene.immediateSituation,
    status: "active",
    startedAt: campaign.createdAt,
    endedAt: null,
    updatedAt: campaign.createdAt,
  });
  campaign.consequences.push({
    id: "consequence-1",
    title: "Suspicious quiet at the gate",
    description: "Future checks should account for the eerie quiet.",
    scope: "scene",
    state: "active",
    importance: "medium",
    sourceSceneId: "scene-1",
    relatedSceneIds: ["scene-1"],
    participantIds: [campaign.party[0]?.id ?? "actor-1"],
    relationshipIds: [],
    threadIds: [],
    tags: ["watch"],
    createdAt: campaign.createdAt,
    updatedAt: campaign.createdAt,
    resolvedAt: null,
    resolution: "",
  });
  campaign.turnLog.push({
    id: "turn-1",
    mode: "combat",
    state: "complete",
    actorId: campaign.party[0]?.id ?? "actor-1",
    inputKind: "player",
    providerRequestId: "provider-1",
    startedAt: campaign.createdAt,
    completedAt: campaign.createdAt,
    summary: "Thor dodged.",
  });
  campaign.providerEventLog.push({
    id: "event-1",
    type: "generation_completed",
    turnId: "turn-1",
    requestId: "provider-1",
    createdAt: campaign.createdAt,
  });
  campaign.diceLog.push({
    id: "roll-1",
    turnId: "turn-1",
    actorId: campaign.party[0]?.id ?? "actor-1",
    targetId: "miner",
    label: "Attack roll",
    formula: "1d20+5",
    total: 17,
    createdAt: campaign.createdAt,
  });
  campaign.stateEffectLog.push({
    id: "effect-1",
    turnId: "turn-1",
    type: "hp_delta",
    targetId: "miner",
    amount: -8,
    reason: "Greataxe hit",
    status: "applied",
    createdAt: campaign.createdAt,
  });
  campaign.combatActionLog.push({
    id: "combat-action-1",
    turnId: "turn-1",
    actorId: campaign.party[0]?.id ?? "actor-1",
    actionType: "attack",
    targetIds: ["miner"],
    declaredText: "Attack with Greataxe",
    narration: "The blow lands.",
    createdAt: campaign.createdAt,
  });
  const sqlitePath = path.join(tempDir, "sqlite-2-campaign.lorekeeper.sqlite");

  const writeResult = await writeCampaignSqliteFile(campaign, sqlitePath);
  assert.ok(writeResult.bytes > 0);

  const summary = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(summary.metadata["lorekeeper.sqlite_schema"], SQLITE_SCHEMA_VERSION);
  assert.equal(summary.metadata["lorekeeper.sqlite_user_version"], String(SQLITE_USER_VERSION));
  assert.equal(summary.campaign.schema_version, "2.0.0");
  assert.ok(summary.counts.scene >= 1);
  assert.equal(summary.counts.scenes, 1);
  assert.equal(summary.counts.consequences, 1);
  assert.ok(summary.counts.combat >= 1);
  assert.ok(summary.counts.engine_state >= 1);
  assert.ok(summary.counts.rules_profile >= 1);
  assert.equal(summary.engineCounts.turn_records, 1);
  assert.equal(summary.engineCounts.provider_events, 1);
  assert.equal(summary.engineCounts.dice_rolls, 1);
  assert.equal(summary.engineCounts.state_effects, 1);
  assert.equal(summary.engineCounts.combat_actions, 1);
  assert.equal(summary.engineCounts.errors, 0);

  await appendCampaignErrorToSqliteFile(sqlitePath, {
    campaignId: campaign.id,
    severity: "error",
    source: "provider",
    eventType: "provider_response_parse_error",
    message: "Qwen returned an empty table response.",
    requestId: "request-1",
    providerId: "ollama",
    model: "qwen3:14b",
    data: { rawTextPreview: "{\"narrative\":\"...\"}" },
  });
  const errorsAfterAppend = await readCampaignErrorsFromSqliteFile(sqlitePath);
  assert.equal(errorsAfterAppend.length, 1);
  assert.equal(errorsAfterAppend[0].eventType, "provider_response_parse_error");
  assert.equal(errorsAfterAppend[0].model, "qwen3:14b");
  assert.match(errorsAfterAppend[0].data.rawTextPreview, /narrative/);

  const roundTrip = await readCampaignFromSqliteFile(sqlitePath);
  assert.equal(roundTrip.title, campaign.title);
  assert.equal(roundTrip.schemaVersion, "2.0.0");
  assert.equal(roundTrip.scene.currentPlaceId, campaign.scene.currentPlaceId);
  assert.deepEqual(roundTrip.scene.presentPeopleIds, campaign.scene.presentPeopleIds);
  assert.equal(roundTrip.scene.activeSceneId, "scene-1");
  assert.equal(roundTrip.scenes.length, 1);
  assert.equal(roundTrip.consequences.length, 1);
  assert.equal(roundTrip.engineState.mode, "combat");
  assert.equal(roundTrip.turnLog.length, 1);
  assert.equal(roundTrip.diceLog.length, 1);
  assert.equal(roundTrip.stateEffectLog.length, 1);
  assert.equal(roundTrip.combatActionLog.length, 1);
  assert.equal(roundTrip.providerEventLog.length, 1);

  await writeCampaignSqliteFile(campaign, sqlitePath);
  const errorsAfterRewrite = await readCampaignErrorsFromSqliteFile(sqlitePath);
  assert.equal(errorsAfterRewrite.length, 1);
  assert.equal(errorsAfterRewrite[0].message, "Qwen returned an empty table response.");
  const summaryAfterRewrite = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(summaryAfterRewrite.engineCounts.errors, 1);

  const repoRoot = path.join(tempDir, "campaign-repo");
  const first = await createNewActiveCampaign(repoRoot, {
    title: "Delete Target",
    premise: "This campaign should be deleted.",
  });
  const second = await createNewActiveCampaign(repoRoot, {
    title: "Keep Target",
    premise: "This campaign should survive.",
  });
  assert.ok(existsSync(first.sqlitePath));
  assert.ok(existsSync(second.sqlitePath));

  await assert.rejects(
    () => deleteCampaign(repoRoot, { sqlitePath: path.join(repoRoot, "not-campaign.sqlite") }),
    /Campaign must be inside data\/campaigns/,
  );
  assert.ok(existsSync(first.sqlitePath));

  const afterDelete = await deleteCampaign(repoRoot, {
    sqlitePath: second.sqlitePath,
  });
  assert.equal(existsSync(second.sqlitePath), false);
  assert.equal(afterDelete.campaign.title, "Delete Target");

  const campaigns = await listCampaigns(repoRoot);
  assert.ok(campaigns.campaigns.some((entry) => entry.title === "Delete Target"));
  assert.equal(campaigns.campaigns.some((entry) => entry.title === "Keep Target"), false);

  const indexPath = path.join(repoRoot, "data", "campaigns", "campaign-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.campaigns.some((entry) => path.resolve(entry.sqlitePath) === path.resolve(second.sqlitePath)), false);
  assert.equal(index.hiddenCampaignPaths.some((sqlitePath) => path.resolve(sqlitePath) === path.resolve(second.sqlitePath)), false);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Lorekeeper SQLite storage tests passed.");
