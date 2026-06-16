export const SQLITE_SCHEMA_VERSION = "2.0.0";
export const SQLITE_USER_VERSION = 2000000;

export const SQLITE_MIGRATIONS = [];

export function readSqliteSchemaIdentity(db) {
  const metadata = tableExists(db, "metadata")
    ? Object.fromEntries(queryRows(db, "SELECT key, value FROM metadata").map((row) => [row.key, row.value]))
    : {};
  const userVersion = firstRow(db, "PRAGMA user_version")?.user_version ?? null;
  return {
    schemaVersion: metadata["lorekeeper.sqlite_schema"] || "",
    userVersion: Number(userVersion),
    metadata,
  };
}

export function migrateSqliteSchema(db) {
  const identity = readSqliteSchemaIdentity(db);
  if (identity.schemaVersion === SQLITE_SCHEMA_VERSION && identity.userVersion === SQLITE_USER_VERSION) {
    return {
      status: "current",
      migrated: false,
      fromSchemaVersion: identity.schemaVersion,
      fromUserVersion: identity.userVersion,
      toSchemaVersion: SQLITE_SCHEMA_VERSION,
      toUserVersion: SQLITE_USER_VERSION,
      applied: [],
    };
  }

  if (identity.userVersion > SQLITE_USER_VERSION) {
    throw new Error(
      `Unsupported newer SQLite user_version: ${identity.userVersion}. Expected ${SQLITE_USER_VERSION}.`,
    );
  }

  throw new Error(
    `Unsupported SQLite schema: ${identity.schemaVersion || "missing"} / user_version ${Number.isFinite(identity.userVersion) ? identity.userVersion : "missing"}. Expected ${SQLITE_SCHEMA_VERSION} / ${SQLITE_USER_VERSION}. No migration path is registered.`,
  );
}

function tableExists(db, tableName) {
  return Boolean(
    firstRow(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", [tableName]),
  );
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
