# Operations runbook

## Deploy and verify

Production deploys from `main`. The workflow installs locked dependencies, runs TypeScript and unit checks, applies D1 migrations, and then deploys the Worker. After a deploy, verify `/api/health`, the sign-in page, an authenticated library load, and a CSV preview before announcing the release.

## Backup and restore

The weekly `Backup D1` workflow exports an encrypted-at-rest GitHub Actions artifact retained for 30 days. It contains private collection and accounting data: only repository administrators may download it.

To perform the quarterly restore drill:

1. Download the newest `boardgameengine-d1-*` artifact.
2. Create a temporary D1 database in the same Cloudflare account.
3. Apply `app/migrations` to the temporary database.
4. Import the SQL export with `wrangler d1 execute <temporary-name> --remote --file backup.sql`.
5. Query user, copy, import, trade, and audit counts and compare them with production.
6. Delete the temporary database and record the date and result in the repository issue tracker. Never restore over production as a drill.

## Incident handling

Do not log CSV rows, email sign-in tokens, private comments, or exported account data. Record only a request identifier, route, response status, and redacted error category. For suspected data corruption, disable the affected write path, export D1, preserve the relevant audit events, and restore only after the owner approves the recovery point.
