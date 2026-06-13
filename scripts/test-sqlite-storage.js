import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import {
  readCampaignFromSqliteFile,
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
  assert.ok(summary.counts.combat >= 1);
  assert.ok(summary.counts.engine_state >= 1);
  assert.ok(summary.counts.rules_profile >= 1);
  assert.equal(summary.engineCounts.turn_records, 1);
  assert.equal(summary.engineCounts.provider_events, 1);
  assert.equal(summary.engineCounts.dice_rolls, 1);
  assert.equal(summary.engineCounts.state_effects, 1);
  assert.equal(summary.engineCounts.combat_actions, 1);

  const roundTrip = await readCampaignFromSqliteFile(sqlitePath);
  assert.equal(roundTrip.title, campaign.title);
  assert.equal(roundTrip.schemaVersion, "2.0.0");
  assert.equal(roundTrip.scene.currentPlaceId, campaign.scene.currentPlaceId);
  assert.deepEqual(roundTrip.scene.presentPeopleIds, campaign.scene.presentPeopleIds);
  assert.equal(roundTrip.engineState.mode, "combat");
  assert.equal(roundTrip.turnLog.length, 1);
  assert.equal(roundTrip.diceLog.length, 1);
  assert.equal(roundTrip.stateEffectLog.length, 1);
  assert.equal(roundTrip.combatActionLog.length, 1);
  assert.equal(roundTrip.providerEventLog.length, 1);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Lorekeeper SQLite storage tests passed.");
