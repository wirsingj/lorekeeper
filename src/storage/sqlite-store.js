import initSqlJs from "sql.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCampaign, validateCampaign } from "../campaign-state/schema.js";

const schemaPath = fileURLToPath(new URL("./sqlite-schema.sql", import.meta.url));
export const SQLITE_SCHEMA_VERSION = "2.0.0";
export const SQLITE_USER_VERSION = 2000000;

export async function createSqliteDatabaseForCampaign(campaign) {
  const errors = validateCampaign(campaign);
  if (errors.length > 0) {
    throw new Error(`Cannot create SQLite campaign from invalid state: ${errors.join(" ")}`);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const schema = await readFile(schemaPath, "utf8");
  db.run(schema);
  insertCampaign(db, campaign);
  return db;
}

export async function writeCampaignSqliteFile(campaign, outputPath) {
  const db = await createSqliteDatabaseForCampaign(campaign);
  const bytes = db.export();
  db.close();
  await writeFileAtomically(outputPath, bytes);

  return {
    path: outputPath,
    bytes: bytes.length,
  };
}

export async function readCampaignFromSqliteFile(sqlitePath) {
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    const snapshot = firstRow(
      db,
      "SELECT campaign_json, campaign_json_sha256 FROM campaign_snapshots LIMIT 1",
    );
    if (!snapshot?.campaign_json) {
      throw new Error("SQLite campaign file does not contain a schema 2.0 campaign snapshot.");
    }
    const hash = sha256(snapshot.campaign_json);
    if (snapshot.campaign_json_sha256 && snapshot.campaign_json_sha256 !== hash) {
      throw new Error("SQLite campaign snapshot hash mismatch.");
    }
    return normalizeCampaign(JSON.parse(snapshot.campaign_json));
  } finally {
    db.close();
  }
}

export async function overwriteCampaignSqliteFile(campaign, outputPath) {
  return writeCampaignSqliteFile(campaign, outputPath);
}

async function writeFileAtomically(outputPath, bytes) {
  const directory = path.dirname(outputPath);
  const tempPath = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempPath, bytes);
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readCampaignSqliteSummary(sqlitePath) {
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  const campaign = firstRow(db, "SELECT id, title, summary, schema_version FROM campaigns LIMIT 1");
  const metadata = tableExists(db, "metadata")
    ? Object.fromEntries(queryRows(db, "SELECT key, value FROM metadata").map((row) => [row.key, row.value]))
    : {};
  const counts = Object.fromEntries(
    queryRows(db, "SELECT domain, COUNT(*) AS count FROM records GROUP BY domain").map((row) => [
      row.domain,
      row.count,
    ]),
  );
  const engineCounts = Object.fromEntries(
    ["turn_records", "provider_events", "dice_rolls", "state_effects", "combat_actions"]
      .filter((tableName) => tableExists(db, tableName))
      .map((tableName) => [tableName, firstRow(db, `SELECT COUNT(*) AS count FROM ${tableName}`)?.count ?? 0]),
  );
  db.close();

  return {
    campaign,
    metadata,
    counts,
    engineCounts,
  };
}

function insertCampaign(db, campaign) {
  const now = new Date().toISOString();
  const campaignJson = JSON.stringify(campaign);

  insertMetadata(db, "lorekeeper.storage", "sqlite", now);
  insertMetadata(db, "lorekeeper.sqlite_schema", SQLITE_SCHEMA_VERSION, now);
  insertMetadata(db, "lorekeeper.sqlite_user_version", String(SQLITE_USER_VERSION), now);
  insertMetadata(db, "lorekeeper.snapshot_hash", sha256(campaignJson), now);

  runInsert(db, "campaigns", {
    id: campaign.id,
    title: campaign.title,
    summary: campaign.summary,
    schema_version: campaign.schemaVersion,
    hidden: campaign.hidden ? 1 : 0,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
    data_json: JSON.stringify({
      providerSettings: campaign.providerSettings ?? {},
      promptTemplates: campaign.promptTemplates ?? {},
      recapTemplates: campaign.recapTemplates ?? {},
      multiplayer: campaign.multiplayer ?? {},
    }),
  });

  runInsert(db, "campaign_snapshots", {
    campaign_id: campaign.id,
    snapshot_version: 1,
    campaign_json: campaignJson,
    campaign_json_sha256: sha256(campaignJson),
    updated_at: campaign.updatedAt,
  });

  insertRecordGroup(db, campaign, "people", campaign.people, (record) => record.name);
  insertRecordGroup(db, campaign, "party", campaign.party, (record) => record.name);
  insertRecordGroup(db, campaign, "factions", campaign.factions, (record) => record.name);
  insertRecordGroup(db, campaign, "places", campaign.places, (record) => record.name);
  insertRecordGroup(db, campaign, "maps", campaign.maps, (record) => record.name);
  insertRecordGroup(db, campaign, "items", campaign.items, (record) => record.name);
  insertRecordGroup(db, campaign, "inventory", campaign.inventory, (record) => record.itemId);
  insertRecordGroup(db, campaign, "lore", campaign.lore, (record) => record.title);
  insertRecordGroup(db, campaign, "timeline", campaign.timeline, (record) => record.summary);
  insertRecordGroup(db, campaign, "quests", campaign.quests, (record) => record.title);
  insertRecordGroup(db, campaign, "scenes", campaign.scenes, (record) => record.title);
  insertRecordGroup(db, campaign, "consequences", campaign.consequences, (record) => record.title);
  insertRecordGroup(db, campaign, "scene", [campaign.scene], () => "Current scene", "scene-current");
  insertRecordGroup(db, campaign, "combat", [campaign.combat], () => "Combat state", "combat-current");
  insertRecordGroup(db, campaign, "engine_state", [campaign.engineState], () => "Engine state", "engine-state-current");
  insertRecordGroup(db, campaign, "rules_profile", [campaign.rulesProfile], () => "Rules profile", "rules-profile-current");
  insertRecordGroup(db, campaign, "style", [campaign.style], () => "Campaign style", "style-current");
  insertRecordGroup(
    db,
    campaign,
    "prompt_templates",
    campaign.promptTemplates.templates,
    (record) => record.name,
  );
  insertRecordGroup(
    db,
    campaign,
    "recap_templates",
    campaign.recapTemplates.templates,
    (record) => record.name,
  );

  insertSessionLog(db, campaign);
  insertReviewLog(db, campaign);
  insertEngineLogs(db, campaign);

  for (const relationship of campaign.relationships) {
    runInsert(db, "relationships", {
      id: relationship.id,
      campaign_id: campaign.id,
      source_id: relationship.sourceId,
      target_id: relationship.targetId,
      relationship_type: relationship.type,
      notes: relationship.notes ?? "",
      data_json: JSON.stringify(relationship),
      created_at: now,
      updated_at: now,
    });
  }

  for (const asset of campaign.assets) {
    runInsert(db, "assets", {
      id: asset.id,
      campaign_id: campaign.id,
      name: asset.name,
      kind: asset.kind,
      path: asset.path,
      media_type: asset.mediaType ?? "",
      notes: (asset.notes ?? []).join("\n"),
      data_json: JSON.stringify(asset),
      created_at: now,
      updated_at: now,
    });
  }

  for (const sourceDocument of campaign.sourceDocuments) {
    runInsert(db, "source_documents", {
      id: sourceDocument.id,
      campaign_id: campaign.id,
      name: sourceDocument.name,
      kind: sourceDocument.kind,
      path: sourceDocument.path ?? "",
      content: sourceDocument.content,
      source_order: sourceDocument.sourceOrder ?? 0,
      data_json: JSON.stringify(sourceDocument),
      created_at: now,
    });
  }
}

function insertEngineLogs(db, campaign) {
  const now = new Date().toISOString();

  for (const [index, turn] of (campaign.turnLog ?? []).entries()) {
    runInsert(db, "turn_records", {
      campaign_id: campaign.id,
      id: turn.id || turn.turnId || `turn-${index + 1}`,
      mode: turn.mode || "rp",
      state: turn.state || "complete",
      actor_id: turn.actorId || null,
      input_kind: turn.inputKind || "player",
      provider_request_id: turn.providerRequestId || turn.requestId || null,
      started_at: turn.startedAt || turn.createdAt || now,
      completed_at: turn.completedAt || null,
      summary: turn.summary || "",
      data_json: JSON.stringify(turn),
    });
  }

  for (const [index, event] of (campaign.providerEventLog ?? []).entries()) {
    runInsert(db, "provider_events", {
      campaign_id: campaign.id,
      id: event.id || `provider-event-${index + 1}`,
      turn_id: event.turnId || null,
      request_id: event.requestId || null,
      event_type: event.type || event.eventType || "unknown",
      created_at: event.createdAt || event.at || now,
      data_json: JSON.stringify(event),
    });
  }

  for (const [index, roll] of (campaign.diceLog ?? []).entries()) {
    runInsert(db, "dice_rolls", {
      campaign_id: campaign.id,
      id: roll.id || `roll-${index + 1}`,
      turn_id: roll.turnId || null,
      actor_id: roll.actorId || null,
      target_id: roll.targetId || null,
      label: roll.label || null,
      formula: roll.formula || "",
      total: Number(roll.total) || 0,
      created_at: roll.createdAt || now,
      data_json: JSON.stringify(roll),
    });
  }

  for (const [index, effect] of (campaign.stateEffectLog ?? []).entries()) {
    runInsert(db, "state_effects", {
      campaign_id: campaign.id,
      id: effect.id || `effect-${index + 1}`,
      turn_id: effect.turnId || null,
      effect_type: effect.type || "unknown",
      target_id: effect.targetId || null,
      amount: Number.isFinite(Number(effect.amount)) ? Number(effect.amount) : null,
      status: effect.status || "applied",
      reason: effect.reason || "",
      created_at: effect.createdAt || now,
      data_json: JSON.stringify(effect),
    });
  }

  for (const [index, action] of (campaign.combatActionLog ?? []).entries()) {
    runInsert(db, "combat_actions", {
      campaign_id: campaign.id,
      id: action.id || `combat-action-${index + 1}`,
      turn_id: action.turnId || action.id || `combat-turn-${index + 1}`,
      actor_id: action.actorId || "",
      action_type: action.actionType || "improvise",
      target_ids_json: JSON.stringify(action.targetIds ?? []),
      declared_text: action.declaredText || "",
      narration: action.narration || "",
      created_at: action.createdAt || now,
      data_json: JSON.stringify(action),
    });
  }
}

function insertReviewLog(db, campaign) {
  const now = new Date().toISOString();

  for (const batch of campaign.reviewLog ?? []) {
    runInsert(db, "review_batches", {
      campaign_id: campaign.id,
      id: batch.id,
      provider_run_id: batch.providerRunId || null,
      source: batch.source || "unknown",
      status: batch.status || "committed",
      raw_response: batch.rawResponse || "",
      created_at: batch.createdAt || now,
      decided_at: batch.decidedAt || null,
      data_json: JSON.stringify(batch),
    });

    for (const change of batch.proposedChanges ?? []) {
      runInsert(db, "proposed_changes", {
        campaign_id: campaign.id,
        batch_id: batch.id,
        id: change.id || `${batch.id}-change`,
        operation: change.operation || "note",
        domain: change.domain || "lore",
        target_id: change.targetId || null,
        importance: change.importance || "normal",
        visibility: change.visibility || "player_visible",
        summary: change.summary || "Unlabeled proposed update.",
        data_json: JSON.stringify(change.data ?? {}),
        confidence: change.confidence || "unknown",
        reason: change.reason || "",
        status: change.status || "approved",
        created_at: change.createdAt || batch.createdAt || now,
        decided_at: change.decidedAt || null,
      });
    }
  }
}

function insertSessionLog(db, campaign) {
  const now = new Date().toISOString();
  const sessionLog = campaign.sessionLog ?? {};
  const sessions = Array.isArray(sessionLog.sessions) && sessionLog.sessions.length
    ? sessionLog.sessions
    : [
        {
          id: sessionLog.activeSessionId || "session-main",
          title: "Campaign Play",
          startedAt: campaign.createdAt || now,
          endedAt: null,
          recap: "",
        },
      ];

  for (const session of sessions) {
    runInsert(db, "sessions", {
      id: session.id,
      campaign_id: campaign.id,
      title: session.title || "Campaign Play",
      started_at: session.startedAt || now,
      ended_at: session.endedAt || null,
      recap: session.recap || "",
      data_json: JSON.stringify(session),
    });
  }

  for (const [index, message] of (sessionLog.messages ?? []).entries()) {
    runInsert(db, "session_messages", {
      campaign_id: campaign.id,
      id: message.id,
      session_id: message.sessionId || sessionLog.activeSessionId || sessions[0].id,
      sequence: index + 1,
      role: message.role,
      title: message.title,
      body: message.body,
      meta: message.meta || "",
      source: message.source || "unknown",
      provider_run_id: message.providerRunId || null,
      created_at: message.createdAt || now,
      data_json: JSON.stringify(message),
    });
  }
}

function insertRecordGroup(db, campaign, domain, records, titleFor, forcedId = null) {
  const now = new Date().toISOString();

  for (const record of records) {
    const id = forcedId ?? record.id;
    const title = titleFor(record) ?? id;
    const body = recordToBody(record);

    runInsert(db, "records", {
      campaign_id: campaign.id,
      id,
      domain,
      record_type: record.type ?? record.status ?? record.role ?? "",
      title,
      body,
      data_json: JSON.stringify(record),
      source_state: "canon",
      created_at: now,
      updated_at: now,
    });

    runInsert(db, "record_search", {
      campaign_id: campaign.id,
      record_id: id,
      domain,
      title,
      body,
      search_text: [title, body, domain, record.type ?? record.role ?? ""].filter(Boolean).join("\n"),
    });
  }
}

function insertMetadata(db, key, value, now) {
  runInsert(db, "metadata", {
    key,
    value,
    updated_at: now,
  });
}

function assertSqliteSchema2(db) {
  const metadata = tableExists(db, "metadata")
    ? Object.fromEntries(queryRows(db, "SELECT key, value FROM metadata").map((row) => [row.key, row.value]))
    : {};
  if (metadata["lorekeeper.sqlite_schema"] !== SQLITE_SCHEMA_VERSION) {
    throw new Error(`Unsupported SQLite schema: ${metadata["lorekeeper.sqlite_schema"] || "missing"}. Expected ${SQLITE_SCHEMA_VERSION}.`);
  }
  const userVersion = firstRow(db, "PRAGMA user_version")?.user_version;
  if (Number(userVersion) !== SQLITE_USER_VERSION) {
    throw new Error(`Unsupported SQLite user_version: ${userVersion ?? "missing"}. Expected ${SQLITE_USER_VERSION}.`);
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function recordToBody(record) {
  if (Array.isArray(record.notes)) {
    return record.notes.join("\n");
  }

  if (record.summary) {
    return record.summary;
  }

  if (record.immediateSituation) {
    return record.immediateSituation;
  }

  if (record.stakes) {
    return record.stakes;
  }

  return JSON.stringify(record);
}

function runInsert(db, table, values) {
  const keys = Object.keys(values);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  db.run(
    sql,
    keys.map((key) => (values[key] === undefined ? null : values[key])),
  );
}

function queryRows(db, sql) {
  const result = db.exec(sql)[0];
  if (!result) {
    return [];
  }

  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  );
}

function firstRow(db, sql) {
  return queryRows(db, sql)[0] ?? null;
}

function tableExists(db, tableName) {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  )[0];
  return Boolean(result?.values?.length);
}

export function defaultCampaignSqlitePath(campaignTitle, root = process.cwd()) {
  return path.join(root, "data", "campaigns", `${slugify(campaignTitle)}.lorekeeper.sqlite`);
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
