-- Which stage a run was: accrual (trích), payment (chi) or both at once.
ALTER TABLE run_log ADD COLUMN mode TEXT;
