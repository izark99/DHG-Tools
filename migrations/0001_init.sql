-- C&B Form webapp: settings only. No payroll row or amount is ever stored here.
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(username);

CREATE TABLE master_tables (
  name TEXT PRIMARY KEY,
  columns_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);

CREATE TABLE flows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE flow_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id TEXT NOT NULL REFERENCES flows(id),
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX flow_versions_flow ON flow_versions(flow_id, version);

CREATE TABLE ledger_marks (
  ledger TEXT PRIMARY KEY,
  last_period TEXT,
  file_hash TEXT,
  updated_by TEXT,
  updated_at TEXT
);

CREATE TABLE run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id TEXT NOT NULL,
  flow_version INTEGER,
  period TEXT NOT NULL,
  user TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX run_log_flow ON run_log(flow_id, at);
