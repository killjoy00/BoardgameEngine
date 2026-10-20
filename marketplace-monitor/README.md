# BGG -> Facebook Marketplace monitor (pilot)

This component is intentionally separate from BoardGameEngine's application routes, D1 database,
and Cloudflare Worker deployments. It uses the repository's *existing approved* BGG XML API2
application token for a public collection/wishlist snapshot, and an independent Apify token to
query public Facebook Marketplace listings. Never place either token in code or chat messages.

## What it does

1. Fetches the live `killjoy00` wishlist via the existing authenticated BGG XML API2
   integration. BGG changes update search targets automatically. Fails closed on an
   empty or implausibly small response; old CSV exports are never treated as live.
2. Every four hours, fetches the latest successful dataset from the **already-scheduled**
   three priority-1 Apify Marketplace tasks and Xbox task. These are read-only
   dataset fetches, not extra paid searches.
3. Uses up to eight additional paid rotating searches each four-hour cycle for
   wishlist priorities 2-5 (plus newly added priority-1 games lacking a saved
   task). Low-priority games can be missed if they disappear before a scan.
4. Locally filters Marketplace noise, accessories, wrong expansions, and
   out-of-area listings using exact title and nearby Austin location logic.
5. Records first-scan listings as a quiet baseline, then queues only **new
   matching listings or price changes**. Does not send routine empty-result emails.
6. Freezes and commits the outbound batch *before* calling Resend. Sends a
   grouped transactional email using the `RESEND_API_KEY` already supported by
   BoardGameEngine, with an idempotency key to protect retries.
7. Persists email receipts and clears queued matches **only after Resend
   confirms acceptance**. Pending emails survive temporary failures, and
   uncertain batches older than 20 hours stop instead of risking duplicates.

## One-time activation: GitHub Actions secrets

The connected ChatGPT/Apify MCP credential cannot be transferred into an
unattended GitHub runner. Two additional GitHub Actions repository secrets are
needed in `killjoy00/BoardgameEngine` > Settings > Secrets and variables >
Actions > New repository secret:

- `APIFY_API_TOKEN`: create/copy a personal Apify token in
  [Apify account integrations](https://console.apify.com/account/integrations).
  This lets GitHub read existing Apify task results and run rotating wishlist
  searches directly, without ChatGPT automation. Never paste it in chat or
  commit it in GitHub.
- `MARKETPLACE_ALERT_TO`: recipient mailbox for the personal notifications,
  stored as a **secret** rather than exposing an address in this public repo.

Existing `BGG_API_TOKEN` and `RESEND_API_KEY` repository secrets are reused.
The sender is `Marketplace Alerts <login@boardgames.planitnow.us>`, matching
the existing application's domain. The first live email is not considered
verified until Resend reports acceptance and a real recipient confirms delivery.

**No ChatGPT email-sending automation is required or enabled.** A prior Gmail
connector action was blocked by a safety check; do not reattempt it. The
GitHub Action uses the user-owned, verified transactional-email infrastructure
and remains subject to Resend's normal sending rules.

## Operations and cost

- Workflow: `.github/workflows/bgg-marketplace-monitor.yml`.
- On reviewed source merges, updates BGG snapshot and queries only, with no
  Marketplace spend and no email sends.
- On GitHub's roughly four-hour schedule, searches valid BGG data using Apify,
  queues accepted matches, persists the queue, prepares a frozen email batch,
  sends via Resend only if a nonempty batch exists, and writes a receipt.
- `APIFY_API_TOKEN` absent: no paid Marketplace searches or emails (unless
  an earlier valid queued batch awaits delivery).
- `MARKETPLACE_ALERT_TO` or `RESEND_API_KEY` absent: email delivery is off,
  any pending listings remain queued for later.
- Apify charges depend on Actor and listing volume. Each dynamic Actor run
  uses `maxTotalChargeUsd=0.03`; at most eight standard rotating queries run
  per four-hour cycle, plus any new priority-1 searches. This is **not** an
  account-wide monthly cap. The existing four saved task charges are separate.
  Set your Apify account spending limit independently.
- GitHub data/state commits under `marketplace-monitor/data/**` do not
  trigger the monitor workflow again.
- If Resend accepts an email but a receipt push fails, the frozen batch can
  safely retry using the same idempotency key within 24 hours. Batches older
  than 20 hours need manual reconciliation before another attempt.
- No recipient email address, Resend email body, mailbox data or secrets are
  stored in public repository files.

## Output state

- `data/wishlist.json`: current public BGG wishlisted IDs, titles, priorities.
- `data/queries.json`: latest rotating BGG search plan.
- `data/seen.json`: listing + BGG ID and price observed in the last scans.
- `data/alerts.json`: newly detected matching listings from last scan.
- `data/last-scan.json`: scan coverage and failures.
- `data/pending-email.json`: durable queued listing IDs, price, and frozen
  batch; no recipient and no email body.
- `data/email-notified.json`: public-listing-ID-only delivery receipts.
- BGG data attribution: [Powered by BoardGameGeek](https://boardgamegeek.com/).

## Test

`node --test marketplace-monitor/*.test.mjs`

