import initSqlJs from "sql.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCampaign, validateCampaign } from "../campaign-state/schema.js";

const schemaPath = fileURLToPath(new URL("./sqlite-schema.sql", import.meta.url));

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
  await writeFile(outputPath, bytes);

  return {
    path: outputPath,
    bytes: bytes.length,
  };
}

export async function readCampaignFromSqliteFile(sqlitePath) {
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  const snapshot = firstRow(db, "SELECT campaign_json FROM campaign_snapshots LIMIT 1");
  db.close();

  if (!snapshot?.campaign_json) {
    throw new Error("SQLite campaign file does not contain a campaign snapshot.");
  }

  return normalizeCampaign(JSON.parse(snapshot.campaign_json));
}

export async function overwriteCampaignSqliteFile(campaign, outputPath) {
  return writeCampaignSqliteFile(campaign, outputPath);
}

export async function readCampaignSqliteSummary(sqlitePath) {
  const SQL = await initSqlJs();
  const bytes = await readFile(sqlitePath);
  const db = new SQL.Database(bytes);
  const campaign = firstRow(db, "SELECT id, title, summary, schema_version FROM campaigns LIMIT 1");
  const counts = Object.fromEntries(
    queryRows(db, "SELECT domain, COUNT(*) AS count FROM records GROUP BY domain").map((row) => [
      row.domain,
      row.count,
    ]),
  );
  db.close();

  return {
    campaign,
    counts,
  };
}

function insertCampaign(db, campaign) {
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO metadata (key, value) VALUES
      ('lorekeeper.storage', 'sqlite'),
      ('lorekeeper.sqlite_schema', '0.1.1')`,
  );

  runInsert(db, "campaigns", {
    id: campaign.id,
    title: campaign.title,
    summary: campaign.summary,
    schema_version: campaign.schemaVersion,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
  });

  runInsert(db, "campaign_snapshots", {
    campaign_id: campaign.id,
    campaign_json: JSON.stringify(campaign),
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
  insertRecordGroup(db, campaign, "scene", [campaign.scene], () => "Current scene", "scene-current");
  insertRecordGroup(db, campaign, "combat", [campaign.combat], () => "Combat state", "combat-current");
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

function insertReviewLog(db, campaign) {
  const now = new Date().toISOString();

  for (const batch of campaign.reviewLog ?? []) {
    runInsert(db, "review_batches", {
      id: batch.id,
      campaign_id: campaign.id,
      provider_run_id: batch.providerRunId || null,
      status: batch.status || "committed",
      raw_response: batch.rawResponse || "",
      created_at: batch.createdAt || now,
      decided_at: batch.decidedAt || null,
      data_json: JSON.stringify(batch),
    });

    for (const change of batch.proposedChanges ?? []) {
      runInsert(db, "proposed_changes", {
        id: `${batch.id}-${change.id}`,
        batch_id: batch.id,
        operation: change.operation || "note",
        domain: change.domain || "lore",
        target_id: change.targetId || null,
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

  for (const message of sessionLog.messages ?? []) {
    runInsert(db, "session_messages", {
      id: message.id,
      campaign_id: campaign.id,
      session_id: message.sessionId || sessionLog.activeSessionId || sessions[0].id,
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
      id,
      campaign_id: campaign.id,
      domain,
      record_type: record.type ?? record.status ?? "",
      title,
      body,
      data_json: JSON.stringify(record),
      source_state: "canon",
      created_at: now,
      updated_at: now,
    });

    runInsert(db, "record_search", {
      record_id: id,
      campaign_id: campaign.id,
      domain,
      title,
      body,
    });
  }
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
