-- Every BGG HTTP request uses one application token, so pacing must be global
-- rather than scoped to an individual linked BGG account.
CREATE TABLE bgg_request_gate (
  id TEXT PRIMARY KEY CHECK(id = 'global'),
  last_request_at TEXT
);

-- Preserve the most recent existing request timestamp when moving from the
-- per-account gate so deployment cannot accidentally create a short burst.
INSERT INTO bgg_request_gate(id, last_request_at)
SELECT 'global', MAX(last_request_at)
FROM source_accounts;
