import initSqlJs from "sql.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadActiveCampaign } from "../src/storage/campaign-repository.js";
import { readCampaignErrorsFromSqliteFile } from "../src/storage/sqlite-store.js";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.projectRoot || process.cwd());
const limit = Math.max(1, Math.min(Number(args.limit) || 12, 100));
const active = args.sqlite
  ? { sqlitePath: path.resolve(args.sqlite), campaign: null, source: "explicit" }
  : await loadActiveCampaign(projectRoot);

if (!active.sqlitePath || !existsSync(active.sqlitePath)) {
  throw new Error(`No campaign SQLite found at ${active.sqlitePath || "(active campaign missing)"}`);
}

const sqlite = await inspectSqlite(active.sqlitePath, { limit });
const errors = await readCampaignErrorsFromSqliteFile(active.sqlitePath, { limit }).catch((error) => [{
  source: "inspect",
  eventType: "error_read_failed",
  message: error instanceof Error ? error.message : "Unable to read errors.",
  data: {},
}]);

const report = {
  generatedAt: new Date().toISOString(),
  projectRoot,
  sqlitePath: active.sqlitePath,
  source: active.source,
  campaign: active.campaign ? {
    id: active.campaign.id,
    title: active.campaign.title,
    messages: active.campaign.sessionLog?.messages?.length ?? 0,
    party: active.campaign.party?.map((member) => ({
      id: member.id,
      name: member.name,
      controllerKind: member.controllerKind,
    })) ?? [],
  } : sqlite.campaign,
  sqlite,
  errors,
};

console.log(JSON.stringify(report, null, 2));

async function inspectSqlite(sqlitePath, { limit }) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(sqlitePath));
  try {
    const tables = queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name);
    const campaign = firstRow(db, "SELECT id, title, schema_version FROM campaigns LIMIT 1");
    return {
      campaign,
      tables,
      counts: Object.fromEntries(tables.map((tableName) => [
        tableName,
        firstRow(db, `SELECT COUNT(*) AS count FROM ${tableName}`)?.count ?? 0,
      ])),
      recentProviderRuns: tableExists(db, "provider_runs")
        ? queryRows(db, `SELECT id, provider_id, mode, status, created_at, completed_at, substr(prompt,1,1000) AS prompt_preview, substr(response,1,1000) AS response_preview, data_json FROM provider_runs ORDER BY created_at DESC LIMIT ${limit}`)
        : [],
      recentProviderEvents: tableExists(db, "provider_events")
        ? queryRows(db, `SELECT id, turn_id, request_id, event_type, created_at, data_json FROM provider_events ORDER BY created_at DESC LIMIT ${limit}`)
        : [],
      recentMessages: tableExists(db, "session_messages")
        ? queryRows(db, `SELECT sequence, id, role, title, substr(body,1,1000) AS body_preview, meta, source, provider_run_id, created_at, data_json FROM session_messages ORDER BY sequence DESC LIMIT ${limit}`)
        : [],
    };
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--sqlite") output.sqlite = argv[++index];
    else if (item === "--limit") output.limit = argv[++index];
    else if (item === "--project-root") output.projectRoot = argv[++index];
  }
  return output;
}

function tableExists(db, tableName) {
  return Boolean(firstRow(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", [tableName]));
}

function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function firstRow(db, sql, params = []) {
  return queryRows(db, sql, params)[0] || null;
}
