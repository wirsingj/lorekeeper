PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA user_version = 2000000;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY CHECK (length(trim(key)) > 0),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  summary TEXT NOT NULL DEFAULT '',
  schema_version TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE campaign_snapshots (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL DEFAULT 1 CHECK (snapshot_version = 1),
  campaign_json TEXT NOT NULL CHECK (length(campaign_json) > 0),
  campaign_json_sha256 TEXT NOT NULL CHECK (length(campaign_json_sha256) = 64),
  updated_at TEXT NOT NULL
);

CREATE TABLE records (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  domain TEXT NOT NULL CHECK (length(trim(domain)) > 0),
  record_type TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  source_state TEXT NOT NULL DEFAULT 'canon',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX idx_records_campaign_domain_title
ON records (campaign_id, domain, title);

CREATE TABLE record_search (
  campaign_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (campaign_id, record_id),
  FOREIGN KEY (campaign_id, record_id) REFERENCES records(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_record_search_campaign_domain
ON record_search (campaign_id, domain);

CREATE TABLE relationships (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  relationship_type TEXT NOT NULL DEFAULT 'related',
  notes TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX idx_relationships_campaign_source
ON relationships (campaign_id, source_id);

CREATE INDEX idx_relationships_campaign_target
ON relationships (campaign_id, target_id);

CREATE TABLE sessions (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  recap TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, id)
);

CREATE TABLE session_messages (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('dm', 'player', 'party', 'npc', 'system', 'provider')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'unknown',
  provider_run_id TEXT,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, id),
  FOREIGN KEY (campaign_id, session_id) REFERENCES sessions(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_session_messages_campaign_sequence
ON session_messages (campaign_id, sequence, created_at);

CREATE INDEX idx_session_messages_session_sequence
ON session_messages (campaign_id, session_id, sequence, created_at);

CREATE TABLE provider_runs (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  session_id TEXT,
  provider_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX idx_provider_runs_campaign_created
ON provider_runs (campaign_id, created_at);

CREATE TABLE review_batches (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  provider_run_id TEXT,
  source TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL,
  raw_response TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (campaign_id, id)
);

CREATE TABLE proposed_changes (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  operation TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_id TEXT,
  importance TEXT NOT NULL DEFAULT 'normal',
  visibility TEXT NOT NULL DEFAULT 'player_visible',
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (campaign_id, batch_id, id),
  FOREIGN KEY (campaign_id, batch_id) REFERENCES review_batches(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_proposed_changes_batch_status
ON proposed_changes (campaign_id, batch_id, status);

CREATE TABLE assets (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX idx_assets_campaign_kind
ON assets (campaign_id, kind);

CREATE TABLE source_documents (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  source_order INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, id)
);

CREATE INDEX idx_source_documents_campaign_order
ON source_documents (campaign_id, source_order, name);
