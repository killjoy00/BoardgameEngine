-- The scheduled sweep looks up every run still in flight on every cron tick.
CREATE INDEX bgg_sync_runs_active ON bgg_sync_runs(status, created_at);
