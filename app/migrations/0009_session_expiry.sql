-- Sessions had no server-side lifetime: the cookie was set to 400 days and the
-- lookup matched on token_hash alone, so a leaked token stayed valid forever.
ALTER TABLE sessions ADD COLUMN expires_at TEXT;
ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT;

-- Backfill existing rows. strftime with this format matches Date#toISOString so
-- the column compares correctly against the ISO timestamps written from the Worker.
UPDATE sessions
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 days'),
    absolute_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+400 days');

-- A row that somehow has no expires_at fails "expires_at > ?" and is treated as
-- expired, which is the safe direction.
CREATE INDEX sessions_expires_at ON sessions(expires_at);
