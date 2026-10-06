-- Interface texts edited by admins in place (titles, hints, page guides). Key = text id in the UI.
CREATE TABLE ui_texts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);
