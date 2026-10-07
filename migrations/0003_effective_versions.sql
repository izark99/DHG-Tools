-- Effective-dated versions for flows and master tables (by payroll period YYYY-MM).
-- A change always adds a version; old versions stay and keep applying to their own periods.
-- Everything that existed before applies "from the beginning" (2000-01).

ALTER TABLE flow_versions ADD COLUMN effective_from TEXT NOT NULL DEFAULT '2000-01';
ALTER TABLE flow_versions ADD COLUMN note TEXT;
ALTER TABLE flow_versions ADD COLUMN cancelled_at TEXT;
ALTER TABLE flow_versions ADD COLUMN cancelled_by TEXT;

CREATE TABLE master_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancelled_by TEXT,
  UNIQUE (name, version)
);
CREATE INDEX master_versions_name ON master_versions(name, version);

INSERT INTO master_versions (name, version, effective_from, columns_json, rows_json, note, created_by, created_at)
SELECT name, 1, '2000-01', columns_json, rows_json, 'Dữ liệu có sẵn trước khi áp dụng hiệu lực theo kỳ', updated_by,
       COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM master_tables;

DROP TABLE master_tables;

-- which master version each run used (JSON {table: version}); run metadata only, no payroll data
ALTER TABLE run_log ADD COLUMN master_versions TEXT;
