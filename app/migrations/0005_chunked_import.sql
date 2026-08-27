CREATE TABLE import_run_items (
  import_run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  copy_id TEXT NOT NULL,
  PRIMARY KEY(import_run_id, copy_id)
);
