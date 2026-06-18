import initSqlJs from "sql.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCampaign, validateCampaign } from "../campaign-state/schema.js";
import {
  migrateSqliteSchema,
  SQLITE_SCHEMA_VERSION,
  SQLITE_USER_VERSION,
} from "./sqlite-migrations.js";

const schemaPath = fileURLToPath(new URL("./sqlite-schema.sql", import.meta.url));
export { SQLITE_SCHEMA_VERSION, SQLITE_USER_VERSION };

// SQLite is durable canon plus queryable logs. Most writes currently rebuild the
// snapshot file atomically; bounded read helpers below exist so long campaigns
// do not need to hydrate thousands of messages just to render one surface.
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
  // Preserve diagnostic/error rows across snapshot rewrites so failed provider
  // turns remain debuggable even after the campaign state is saved again.
  const preservedErrors = await readCampaignErrorsFromSqliteFile(outputPath, { limit: 500 }).catch(() => []);
  const db = await createSqliteDatabaseForCampaign(campaign);
  insertErrorRows(db, campaign.id, preservedErrors);
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

export async function appendCampaignErrorToSqliteFile(sqlitePath, errorEvent = {}) {
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    ensureErrorsTable(db);
    const campaignId = errorEvent.campaignId || firstRow(db, "SELECT id FROM campaigns LIMIT 1")?.id;
    if (!campaignId) {
      throw new Error("SQLite campaign file does not contain a campaign id.");
    }
    insertErrorRows(db, campaignId, [normalizeErrorRow(errorEvent, campaignId)]);
    const nextBytes = db.export();
    await writeFileAtomically(sqlitePath, nextBytes);
    return {
      sqlitePath,
      bytes: nextBytes.length,
    };
  } finally {
    db.close();
  }
}

export async function ensureCampaignErrorsTableInSqliteFile(sqlitePath) {
  if (!existsLikePath(sqlitePath)) {
    return { sqlitePath, created: false, reason: "missing_file" };
  }
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    const existed = tableExists(db, "errors");
    ensureErrorsTable(db);
    if (existed) {
      return { sqlitePath, created: false, reason: "already_present" };
    }
    const nextBytes = db.export();
    await writeFileAtomically(sqlitePath, nextBytes);
    return { sqlitePath, created: true, bytes: nextBytes.length };
  } finally {
    db.close();
  }
}

export async function readCampaignErrorsFromSqliteFile(sqlitePath, { limit = 80 } = {}) {
  if (!existsLikePath(sqlitePath)) {
    return [];
  }
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    if (!tableExists(db, "errors")) {
      return [];
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 500));
    return queryRows(
      db,
      `SELECT campaign_id, id, severity, source, event_type, message, stack, session_id, turn_id, request_id, provider_id, model, created_at, data_json
       FROM errors
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
    ).map((row) => ({
      campaignId: row.campaign_id,
      id: row.id,
      severity: row.severity,
      source: row.source,
      eventType: row.event_type,
      message: row.message,
      stack: row.stack,
      sessionId: row.session_id,
      turnId: row.turn_id,
      requestId: row.request_id,
      providerId: row.provider_id,
      model: row.model,
      createdAt: row.created_at,
      data: parseJson(row.data_json, {}),
    }));
  } finally {
    db.close();
  }
}

export async function readRecentSessionMessagesFromSqliteFile(sqlitePath, options = {}) {
  if (!existsLikePath(sqlitePath)) {
    return [];
  }
  const safeLimit = boundedSqlLimit(options.limit, 240, 1000);
  const beforeSequence = Number.isFinite(Number(options.beforeSequence)) ? Number(options.beforeSequence) : null;
  const sessionId = compactOptionalText(options.sessionId, 120);
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    if (!tableExists(db, "session_messages")) {
      return [];
    }
    const campaignId = firstRow(db, "SELECT id FROM campaigns LIMIT 1")?.id;
    if (!campaignId) {
      return [];
    }
    const where = ["campaign_id = ?"];
    const params = [campaignId];
    if (sessionId) {
      where.push("session_id = ?");
      params.push(sessionId);
    }
    if (beforeSequence !== null) {
      where.push("sequence < ?");
      params.push(beforeSequence);
    }
    const rows = queryRows(
      db,
      `SELECT id, session_id, sequence, role, title, body, meta, source, provider_run_id, created_at, data_json
       FROM session_messages
       WHERE ${where.join(" AND ")}
       ORDER BY sequence DESC, created_at DESC
       LIMIT ${safeLimit}`,
      params,
    );
    return rows.reverse().map((row) => normalizeSessionMessageRow(row));
  } finally {
    db.close();
  }
}

export async function readCampaignRecordsFromSqliteFile(sqlitePath, options = {}) {
  if (!existsLikePath(sqlitePath)) {
    return [];
  }
  const safeLimit = boundedSqlLimit(options.limit, 80, 500);
  const domains = Array.isArray(options.domains)
    ? options.domains.map((domain) => compactOptionalText(domain, 80)).filter(Boolean)
    : [];
  const query = compactOptionalText(options.query, 160);
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  try {
    assertSqliteSchema2(db);
    const campaignId = firstRow(db, "SELECT id FROM campaigns LIMIT 1")?.id;
    if (!campaignId) {
      return [];
    }
    if (query && tableExists(db, "record_search")) {
      return queryCampaignRecordSearch(db, campaignId, { domains, query, limit: safeLimit });
    }
    if (!tableExists(db, "records")) {
      return [];
    }
    const where = ["campaign_id = ?"];
    const params = [campaignId];
    if (domains.length) {
      where.push(`domain IN (${domains.map(() => "?").join(", ")})`);
      params.push(...domains);
    }
    const rows = queryRows(
      db,
      `SELECT id, domain, record_type, title, body, source_state, created_at, updated_at, data_json
       FROM records
       WHERE ${where.join(" AND ")}
       ORDER BY domain ASC, title ASC
       LIMIT ${safeLimit}`,
      params,
    );
    return rows.map((row) => normalizeRecordRow(row));
  } finally {
    db.close();
  }
}

async function writeFileAtomically(outputPath, bytes) {
  const directory = path.dirname(outputPath);
  const tempPath = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempPath, bytes);
    await renameWithWindowsRetry(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function renameWithWindowsRetry(sourcePath, targetPath) {
  const retryableCodes = new Set(["EPERM", "EBUSY", "EACCES"]);
  const delays = [35, 75, 150, 300, 600, 1000];
  let lastError = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code) || attempt === delays.length) {
        throw error;
      }
      await delay(delays[attempt]);
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    ["turn_records", "provider_events", "errors", "dice_rolls", "state_effects", "combat_actions"]
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

function insertErrorRows(db, campaignId, errors = []) {
  ensureErrorsTable(db);
  for (const error of errors) {
    const row = normalizeErrorRow(error, campaignId);
    runInsert(db, "errors", {
      campaign_id: row.campaignId,
      id: row.id,
      severity: row.severity,
      source: row.source,
      event_type: row.eventType,
      message: row.message,
      stack: row.stack,
      session_id: row.sessionId,
      turn_id: row.turnId,
      request_id: row.requestId,
      provider_id: row.providerId,
      model: row.model,
      created_at: row.createdAt,
      data_json: JSON.stringify(row.data ?? {}),
    });
  }
}

function normalizeErrorRow(error = {}, campaignId = "") {
  const createdAt = error.createdAt || error.created_at || new Date().toISOString();
  const source = compactSqlText(error.source || "app", 80);
  const eventType = compactSqlText(error.eventType || error.event_type || error.type || "unknown", 120);
  return {
    campaignId: error.campaignId || error.campaign_id || campaignId,
    id: error.id || `err-${Date.parse(createdAt) || Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    severity: normalizeErrorSeverity(error.severity),
    source,
    eventType,
    message: String(error.message || error.error || "Unknown error").slice(0, 4000),
    stack: String(error.stack || "").slice(0, 12000),
    sessionId: error.sessionId || error.session_id || null,
    turnId: error.turnId || error.turn_id || null,
    requestId: error.requestId || error.request_id || null,
    providerId: error.providerId || error.provider_id || null,
    model: error.model || null,
    createdAt,
    data: error.data && typeof error.data === "object" ? error.data : {},
  };
}

function normalizeErrorSeverity(value) {
  const severity = String(value || "error").trim().toLowerCase();
  return ["debug", "info", "warning", "error", "fatal"].includes(severity) ? severity : "error";
}

function compactSqlText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength) || "unknown";
}

function compactOptionalText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function boundedSqlLimit(value, fallback, max) {
  return Math.max(1, Math.min(Number(value) || fallback, max));
}

function normalizeSessionMessageRow(row) {
  const data = parseJson(row.data_json, {});
  return {
    ...data,
    id: data.id ?? row.id,
    sessionId: data.sessionId ?? row.session_id,
    sequence: row.sequence,
    role: data.role ?? row.role,
    title: data.title ?? row.title,
    body: data.body ?? row.body,
    meta: data.meta ?? row.meta,
    source: data.source ?? row.source,
    providerRunId: data.providerRunId ?? row.provider_run_id,
    createdAt: data.createdAt ?? row.created_at,
  };
}

function normalizeRecordRow(row) {
  return {
    id: row.id,
    domain: row.domain,
    recordType: row.record_type,
    title: row.title,
    body: row.body,
    sourceState: row.source_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseJson(row.data_json, {}),
  };
}

function queryCampaignRecordSearch(db, campaignId, { domains, query, limit }) {
  const where = ["campaign_id = ?", "search_text LIKE ? ESCAPE '\\'"];
  const params = [campaignId, `%${escapeSqlLike(query)}%`];
  if (domains.length) {
    where.push(`domain IN (${domains.map(() => "?").join(", ")})`);
    params.push(...domains);
  }
  const rows = queryRows(
    db,
    `SELECT record_id AS id, domain, title, body, search_text
     FROM record_search
     WHERE ${where.join(" AND ")}
     ORDER BY domain ASC, title ASC
     LIMIT ${limit}`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    title: row.title,
    body: row.body,
    searchText: row.search_text,
  }));
}

function escapeSqlLike(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

function ensureErrorsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS errors (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      id TEXT NOT NULL CHECK (length(trim(id)) > 0),
      severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'fatal')),
      source TEXT NOT NULL DEFAULT 'app',
      event_type TEXT NOT NULL DEFAULT 'unknown',
      message TEXT NOT NULL DEFAULT '',
      stack TEXT NOT NULL DEFAULT '',
      session_id TEXT,
      turn_id TEXT,
      request_id TEXT,
      provider_id TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (campaign_id, id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_errors_campaign_created ON errors (campaign_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_errors_campaign_source ON errors (campaign_id, source, event_type, created_at)");
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
  migrateSqliteSchema(db);
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

function queryRows(db, sql, params = []) {
  const result = db.exec(sql, params)[0];
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

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function existsLikePath(value) {
  return Boolean(value && existsSync(value));
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
