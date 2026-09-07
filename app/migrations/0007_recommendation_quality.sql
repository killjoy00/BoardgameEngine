ALTER TABLE bgg_sync_runs ADD COLUMN request_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bgg_sync_runs ADD COLUMN retry_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bgg_sync_runs ADD COLUMN failed_requests INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bgg_sync_runs ADD COLUMN omitted_items INTEGER NOT NULL DEFAULT 0;

CREATE TABLE recommendation_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id INTEGER NOT NULL REFERENCES games(id),
  players INTEGER NOT NULL,
  player_band TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  min_weight REAL NOT NULL,
  max_weight REAL NOT NULL,
  mode TEXT NOT NULL,
  policy TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL NOT NULL,
  label TEXT NOT NULL CHECK(label IN ('great','reasonable','wrong')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX recommendation_feedback_user_created_idx ON recommendation_feedback(user_id,created_at DESC);
CREATE INDEX recommendation_feedback_game_idx ON recommendation_feedback(user_id,bgg_id);
