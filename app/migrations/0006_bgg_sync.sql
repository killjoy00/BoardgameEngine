CREATE TABLE source_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'bgg' CHECK(provider = 'bgg'),
  username TEXT NOT NULL COLLATE NOCASE,
  last_collection_sync_at TEXT,
  last_full_sync_at TEXT,
  last_request_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider)
);

ALTER TABLE games ADD COLUMN bgg_type TEXT;
ALTER TABLE games ADD COLUMN thumbnail_url TEXT;
ALTER TABLE games ADD COLUMN bgg_fetched_at TEXT;

ALTER TABLE collection_items ADD COLUMN source_name TEXT;
ALTER TABLE collection_items ADD COLUMN source_account_id TEXT REFERENCES source_accounts(id);
ALTER TABLE collection_items ADD COLUMN source_synced_at TEXT;

CREATE INDEX collection_items_source_account ON collection_items(source_account_id, own);
CREATE INDEX games_bgg_freshness ON games(bgg_fetched_at);

CREATE TABLE bgg_sync_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_account_id TEXT NOT NULL REFERENCES source_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','complete','partial','failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  enriched_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE bgg_sync_items (
  run_id TEXT NOT NULL REFERENCES bgg_sync_runs(id) ON DELETE CASCADE,
  bgg_id INTEGER NOT NULL REFERENCES games(id),
  collection_item_id TEXT NOT NULL REFERENCES collection_items(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','failed')),
  error TEXT,
  PRIMARY KEY(run_id, bgg_id)
);

CREATE INDEX bgg_sync_items_pending ON bgg_sync_items(run_id, status, bgg_id);

CREATE TABLE game_polls (
  bgg_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_count TEXT NOT NULL,
  best_votes INTEGER NOT NULL DEFAULT 0,
  recommended_votes INTEGER NOT NULL DEFAULT 0,
  not_recommended_votes INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(bgg_id, player_count)
);

CREATE INDEX game_polls_player_count ON game_polls(player_count, bgg_id);

CREATE TABLE game_tags (
  bgg_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('category','mechanic')),
  bgg_tag_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY(bgg_id, kind, bgg_tag_id)
);
