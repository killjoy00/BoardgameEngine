-- Browser and cron can both advance the same sync run. A short recoverable lease
-- prevents them from selecting and enriching the same pending Thing batch.
ALTER TABLE bgg_sync_runs ADD COLUMN lease_token TEXT;
ALTER TABLE bgg_sync_runs ADD COLUMN lease_until TEXT;
