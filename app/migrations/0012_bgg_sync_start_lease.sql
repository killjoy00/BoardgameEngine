-- Starting a sync includes a potentially slow BGG Collection request before the
-- sync-run row exists. Lease that start phase so two tabs cannot both launch it.
ALTER TABLE source_accounts ADD COLUMN sync_start_token TEXT;
ALTER TABLE source_accounts ADD COLUMN sync_start_until TEXT;
