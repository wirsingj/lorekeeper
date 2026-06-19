import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import initSqlJs from "sql.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { createReviewBatch } from "../src/canon-review/proposals.js";
import {
  createNewActiveCampaign,
  deleteCampaign,
  listCampaigns,
  loadActiveCampaign,
  loadImportedCampaign,
  updateActiveCampaign,
} from "../src/storage/campaign-repository.js";
import { commitReviewBatch } from "../src/storage/review-commit.js";
import { createCampaignBundle, serializeCampaignBundle } from "../src/storage/campaign-bundle.js";
import {
  appendCampaignErrorToSqliteFile,
  ensureCampaignErrorsTableInSqliteFile,
  readCampaignFromSqliteFile,
  readCampaignErrorsFromSqliteFile,
  readCampaignRecordsFromSqliteFile,
  readCampaignSqliteSummary,
  readRecentSessionMessagesFromSqliteFile,
  SQLITE_SCHEMA_VERSION,
  SQLITE_USER_VERSION,
  writeCampaignSqliteFile,
} from "../src/storage/sqlite-store.js";
import { migrateSqliteSchema, readSqliteSchemaIdentity } from "../src/storage/sqlite-migrations.js";

const tempDir = await mkdtemp(path.join(tmpdir(), "lorekeeper-sqlite-"));

try {
  const campaign = createStarterCampaign({
    title: "SQLite 2 Campaign",
    premise: "A storage regression campaign.",
    startingLocation: "Schema Gate",
  });
  campaign.engineState.mode = "combat";
  campaign.playerNotes = {
    people: "Captain Ellow owes us a straight answer.",
    places: "Schema Gate has hidden murder holes.",
    things: "Silver key, cracked seal.",
    scratch: "Ask why the watch changed shifts early.",
    updatedAt: campaign.createdAt,
  };
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

  const DriftSQL = await initSqlJs();
  const driftDb = new DriftSQL.Database(await readFile(sqlitePath));
  try {
    driftDb.run("DROP TABLE errors");
    await writeFile(sqlitePath, driftDb.export());
  } finally {
    driftDb.close();
  }
  const driftSummary = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(Object.hasOwn(driftSummary.engineCounts, "errors"), false);
  const repairResult = await ensureCampaignErrorsTableInSqliteFile(sqlitePath);
  assert.equal(repairResult.created, true);
  const secondRepairResult = await ensureCampaignErrorsTableInSqliteFile(sqlitePath);
  assert.equal(secondRepairResult.created, false);
  const repairedSummary = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(repairedSummary.engineCounts.errors, 0);

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
  assert.equal(roundTrip.playerNotes.people, "Captain Ellow owes us a straight answer.");
  assert.equal(roundTrip.playerNotes.scratch, "Ask why the watch changed shifts early.");

  await writeCampaignSqliteFile(campaign, sqlitePath);
  const errorsAfterRewrite = await readCampaignErrorsFromSqliteFile(sqlitePath);
  assert.equal(errorsAfterRewrite.length, 1);
  assert.equal(errorsAfterRewrite[0].message, "Qwen returned an empty table response.");
  const summaryAfterRewrite = await readCampaignSqliteSummary(sqlitePath);
  assert.equal(summaryAfterRewrite.engineCounts.errors, 1);

  const SQL = await initSqlJs();
  const currentDb = new SQL.Database(await readFile(sqlitePath));
  try {
    const identity = readSqliteSchemaIdentity(currentDb);
    assert.equal(identity.schemaVersion, SQLITE_SCHEMA_VERSION);
    assert.equal(identity.userVersion, SQLITE_USER_VERSION);
    assert.equal(migrateSqliteSchema(currentDb).status, "current");
  } finally {
    currentDb.close();
  }

  const unsupportedPath = path.join(tempDir, "unsupported-user-version.lorekeeper.sqlite");
  const unsupportedDb = new SQL.Database(await readFile(sqlitePath));
  try {
    unsupportedDb.run("PRAGMA user_version = 1000000");
    await writeFile(unsupportedPath, unsupportedDb.export());
  } finally {
    unsupportedDb.close();
  }
  await assert.rejects(
    () => readCampaignFromSqliteFile(unsupportedPath),
    /No migration path is registered/,
  );

  const longCampaign = createLongCampaignFixture();
  const longCampaignPath = path.join(tempDir, "long-campaign.lorekeeper.sqlite");
  await writeCampaignSqliteFile(longCampaign, longCampaignPath);
  const queryStartedAt = performance.now();
  const recentMessages = await readRecentSessionMessagesFromSqliteFile(longCampaignPath, { limit: 25 });
  const earlierMessages = await readRecentSessionMessagesFromSqliteFile(longCampaignPath, {
    beforeSequence: recentMessages[0].sequence,
    limit: 10,
  });
  const places = await readCampaignRecordsFromSqliteFile(longCampaignPath, {
    domains: ["places"],
    limit: 30,
  });
  const searchHits = await readCampaignRecordsFromSqliteFile(longCampaignPath, {
    domains: ["people", "places", "lore"],
    query: "Moonlit Archive",
    limit: 12,
  });
  const queryElapsedMs = performance.now() - queryStartedAt;
  assert.equal(recentMessages.length, 25);
  assert.equal(recentMessages[0].sequence, longCampaign.sessionLog.messages.length - 24);
  assert.equal(recentMessages.at(-1).body, "Long session beat 1200.");
  assert.equal(earlierMessages.length, 10);
  assert.equal(earlierMessages.at(-1).sequence, recentMessages[0].sequence - 1);
  assert.equal(places.length, 30);
  assert.ok(places.every((record) => record.domain === "places"));
  assert.equal(searchHits.length, 12);
  assert.ok(searchHits.every((record) => /Moonlit Archive/.test(record.searchText)));
  assert.ok(queryElapsedMs < 3000, `bounded SQLite queries should stay comfortably local, got ${Math.round(queryElapsedMs)}ms`);

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
  assert.ok(afterDelete.deletedCampaignBackup?.directory);
  assert.ok(existsSync(afterDelete.deletedCampaignBackup.directory));
  assert.ok(afterDelete.deletedCampaignBackup.files.some((filePath) => path.basename(filePath) === path.basename(second.sqlitePath)));
  const deletedFolders = await readdir(path.join(repoRoot, "data", "campaigns", ".deleted"));
  assert.equal(deletedFolders.length, 1);
  assert.equal(afterDelete.campaign.title, "Delete Target");

  const campaigns = await listCampaigns(repoRoot);
  assert.ok(campaigns.campaigns.some((entry) => entry.title === "Delete Target"));
  assert.equal(campaigns.campaigns.some((entry) => entry.title === "Keep Target"), false);

  const indexPath = path.join(repoRoot, "data", "campaigns", "campaign-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.campaigns.some((entry) => path.resolve(entry.sqlitePath) === path.resolve(second.sqlitePath)), false);
  assert.equal(index.hiddenCampaignPaths.some((sqlitePath) => path.resolve(sqlitePath) === path.resolve(second.sqlitePath)), false);

  const corruptIndexRoot = path.join(tempDir, "corrupt-index-repo");
  const recoveredCampaign = createStarterCampaign({
    title: "Recovered Campaign",
    premise: "The index disappeared but the SQLite file survived.",
  });
  const corruptIndexCampaignPath = path.join(corruptIndexRoot, "data", "campaigns", "recovered-campaign.lorekeeper.sqlite");
  await mkdir(path.dirname(corruptIndexCampaignPath), { recursive: true });
  await writeCampaignSqliteFile(recoveredCampaign, corruptIndexCampaignPath);
  await writeFile(path.join(corruptIndexRoot, "data", "campaigns", "campaign-index.json"), "", "utf8");

  const recoveredList = await listCampaigns(corruptIndexRoot);
  assert.equal(recoveredList.campaigns.length, 1);
  assert.equal(recoveredList.campaigns[0].title, "Recovered Campaign");

  const recoveredActive = await loadActiveCampaign(corruptIndexRoot);
  assert.equal(recoveredActive.campaign.title, "Recovered Campaign");

  const afterCorruptCreate = await createNewActiveCampaign(corruptIndexRoot, {
    title: "New After Corrupt Index",
    premise: "New campaign creation should rewrite the index.",
  });
  assert.equal(afterCorruptCreate.campaign.title, "New After Corrupt Index");
  assert.ok(afterCorruptCreate.campaigns.some((entry) => entry.title === "Recovered Campaign"));
  assert.ok(afterCorruptCreate.campaigns.some((entry) => entry.title === "New After Corrupt Index"));
  const repairedIndex = JSON.parse(await readFile(path.join(corruptIndexRoot, "data", "campaigns", "campaign-index.json"), "utf8"));
  assert.ok(repairedIndex.campaigns.length >= 2);

  const reviewRaceRoot = path.join(tempDir, "review-race-repo");
  await createNewActiveCampaign(reviewRaceRoot, {
    title: "Review Race",
    premise: "Review commits must not erase live table side channels.",
  });
  await updateActiveCampaign(reviewRaceRoot, (latestCampaign) => ({
    campaign: {
      ...latestCampaign,
      multiplayer: {
        ...latestCampaign.multiplayer,
        tableTalk: [
          ...(latestCampaign.multiplayer?.tableTalk ?? []),
          {
            id: "talk-during-dm-import",
            playerName: "Host",
            role: "host",
            text: "Side chat should survive review commit.",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    },
  }));
  const reviewRaceCampaign = (await loadActiveCampaign(reviewRaceRoot)).campaign;
  const reviewBatch = createReviewBatch({
    campaignId: reviewRaceCampaign.id,
    source: "storage-test",
    rawResponse: "A new witness enters the scene.",
    proposedChanges: [{
      operation: "add",
      domain: "people",
      summary: "Add a witness",
      data: {
        id: "witness-review-race",
        name: "Race Witness",
        role: "witness",
        summary: "Saw the side chat survive the review commit.",
      },
    }],
  });
  reviewBatch.proposedChanges = reviewBatch.proposedChanges.map((change) => ({
    ...change,
    status: "approved",
  }));
  await commitReviewBatch(reviewRaceRoot, reviewBatch);
  const afterReviewRaceCommit = (await loadActiveCampaign(reviewRaceRoot)).campaign;
  assert.ok(afterReviewRaceCommit.people.some((person) => person.id === "witness-review-race"));
  assert.ok(afterReviewRaceCommit.multiplayer.tableTalk.some((message) => message.id === "talk-during-dm-import"));

  const assetSourceDir = path.join(tempDir, "source-assets");
  await mkdir(assetSourceDir, { recursive: true });
  const sourceAssetPath = path.join(assetSourceDir, "map.png");
  await writeFile(sourceAssetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const importedCampaign = createStarterCampaign({
    title: "Imported Asset Campaign",
    premise: "This campaign should copy imported assets.",
  });
  importedCampaign.assets.push({
    id: "asset-map",
    name: "Forest Map.png",
    path: sourceAssetPath,
    kind: "image",
    mediaType: "image/png",
    notes: [],
  });
  const importedBundlePath = path.join(repoRoot, "data", "imports", "veil-of-the-towers.bundle.json");
  await mkdir(path.dirname(importedBundlePath), { recursive: true });
  await writeFile(importedBundlePath, serializeCampaignBundle(createCampaignBundle(importedCampaign)), "utf8");
  const imported = await loadImportedCampaign(repoRoot);
  const importedAsset = imported.campaign.assets[0];
  assert.ok(importedAsset.path.includes(`${path.sep}data${path.sep}assets${path.sep}`));
  assert.equal(path.resolve(importedAsset.originalPath), path.resolve(sourceAssetPath));
  assert.equal(importedAsset.storage, "app");
  assert.ok(existsSync(importedAsset.path));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("LoreKeeper SQLite storage tests passed.");

function createLongCampaignFixture() {
  const campaign = createStarterCampaign({
    title: "Long Campaign Fixture",
    premise: "A campaign with enough history to catch unbounded storage reads.",
    startingLocation: "Moonlit Archive Gate",
  });
  const now = campaign.createdAt;
  campaign.people = Array.from({ length: 500 }, (_, index) => ({
    id: `person-${index + 1}`,
    name: index % 25 === 0 ? `Moonlit Archive Contact ${index + 1}` : `Old Contact ${index + 1}`,
    role: "contact",
    summary: `A remembered contact from session ${index + 1}.`,
    notes: [`Met during long-campaign fixture beat ${index + 1}.`],
    tags: ["fixture"],
  }));
  campaign.places = [
    ...campaign.places,
    ...Array.from({ length: 500 }, (_, index) => ({
      id: `place-long-${index + 1}`,
      name: index % 20 === 0 ? `Moonlit Archive Annex ${index + 1}` : `Old Road Stop ${index + 1}`,
      type: "location",
      region: "Long Fixture",
      summary: `A place from old campaign history ${index + 1}.`,
      notes: [`Storage query fixture place ${index + 1}.`],
      connectedPlaceIds: [],
    })),
  ];
  campaign.lore = [
    ...campaign.lore,
    ...Array.from({ length: 500 }, (_, index) => ({
      id: `lore-long-${index + 1}`,
      title: index % 30 === 0 ? `Moonlit Archive Rumor ${index + 1}` : `Old Rumor ${index + 1}`,
      canon: true,
      notes: [`A lore note that should not require loading every record into a panel ${index + 1}.`],
      tags: ["fixture"],
    })),
  ];
  campaign.sessionLog = {
    activeSessionId: "session-long",
    sessions: [{
      id: "session-long",
      title: "Long Fixture Session",
      startedAt: now,
      endedAt: null,
      recap: "",
    }],
    messages: Array.from({ length: 1200 }, (_, index) => ({
      id: `message-${index + 1}`,
      sessionId: "session-long",
      role: index % 2 === 0 ? "dm" : "player",
      title: index % 2 === 0 ? "DM" : "YOU",
      body: `Long session beat ${index + 1}.`,
      meta: "",
      source: "fixture",
      providerRunId: null,
      createdAt: new Date(Date.parse(now) + index * 1000).toISOString(),
      data: {},
    })),
  };
  return campaign;
}
