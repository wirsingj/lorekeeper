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
  const sqlitePath = path.join(tempDir, "sqlite-2-campaign.lorekeeper.sqlite");

  const writeResult = await writeCampaignSqliteFile(campaign, sqlitePath);
  assert.ok(writeResult.bytes > 0);

  const summary = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(summary.metadata["lorekeeper.sqlite_schema"], SQLITE_SCHEMA_VERSION);
  assert.equal(summary.metadata["lorekeeper.sqlite_user_version"], String(SQLITE_USER_VERSION));
  assert.equal(summary.campaign.schema_version, "2.0.0");
  assert.ok(summary.counts.scene >= 1);
  assert.ok(summary.counts.combat >= 1);
  assert.ok(summary.counts.rules_profile >= 1);

  const roundTrip = await readCampaignFromSqliteFile(sqlitePath);
  assert.equal(roundTrip.title, campaign.title);
  assert.equal(roundTrip.schemaVersion, "2.0.0");
  assert.equal(roundTrip.scene.currentPlaceId, campaign.scene.currentPlaceId);
  assert.deepEqual(roundTrip.scene.presentPeopleIds, campaign.scene.presentPeopleIds);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Lorekeeper SQLite storage tests passed.");
