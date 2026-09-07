-- BGG may ask the application token to back off longer than our normal five-second
-- pacing interval. Persist that instruction globally so every user/browser/cron
-- caller observes the same server-requested cooldown.
ALTER TABLE bgg_request_gate ADD COLUMN blocked_until TEXT;
