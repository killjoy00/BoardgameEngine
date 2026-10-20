# BGG -> Facebook Marketplace monitor (pilot)

This component is intentionally separate from BoardGameEngine's application routes, D1 database,
and Cloudflare Worker deployments. It uses the repository's *existing approved* BGG XML API2
application token for a public collection/wishlist snapshot, and an independent Apify token to
query public Facebook Marketplace listings. Never place either token in code or chat messages.

## What it does

1. Once per ~20 hours, fetches the live `killjoy00` wishlist (including priorities and
   expansions) via authenticated BGG XML API2. Fail-closed if BGG returns unexpectedly
   few items; **never** replace the saved wishlist with a transient empty BGG response.
2. Every four hours, builds Marketplace searches afresh from the most recent snapshot.
   Adds/removes/priority changes to BGG therefore automatically change future searches.
   No individual saved Apify task needs manual editing.
3. Rotates through priorities to control spend: at the default 12-search cap, all priority-1
   games are checked every four hours, priority-2 games approximately every 20 hours,
   priority-3 games approximately every 4 days, priority-4 around every 6 days, and
   priority-5 around every 20 days. Additionally runs a broad "board games" search.
   These are **pilot coverage intervals, not a guarantee**. Low priority games can be
   missed if listings disappear before their turn. Increase query budget to improve coverage.
4. Uses the already-tested `curious_coder/facebook-marketplace` Apify Actor and filters
   its noisy matches for correct game/edition, non-accessories, and roughly 20-mile Austin
   area. City-only geolocation is approximate when listing coordinates are unavailable.
5. Tracks prior matching listing IDs and prices in `data/seen.json` and publishes only new
   listings/price changes to `data/alerts.json`. First successful scan establishes a silent
   baseline to avoid flooding the user with stale items.
6. Publishes a machine-readable last-scan status in `data/last-scan.json` and preserves
   the last known good state if the scraper fails.

## Setup / security

The BGG token is already defined for BoardGameEngine's existing approved GitHub Actions
integration. Confirm the application approval covers this use, but **do not copy that token**.
One additional independent secret is required for unattended Apify API requests:

- Open GitHub -> `killjoy00/BoardgameEngine` -> Settings -> Secrets and variables ->
  Actions -> New repository secret.
- Set **Name** to `APIFY_API_TOKEN`; generate/copy the token directly from your
  [Apify account settings](https://console.apify.com/account/integrations).
- Never paste tokens in an issue, chat, workflow log, or commit. No Facebook credentials
  or session cookies are required.

The MCP integration's OAuth credential grants ChatGPT access but **does not automatically
populate a GitHub Actions secret**. Until this is configured, the GitHub job refreshes the
BGG wishlist but intentionally **skips** Marketplace scans.

## Operation

- Workflow: `.github/workflows/bgg-marketplace-monitor.yml`.
- Push/PR on this feature branch runs unit tests.
- After merging to `main`, GitHub Actions begins its four-hour schedule.
- Daily BGG sync happens automatically inside the same job based on cached
  `syncedAt`.
- GitHub Actions commits the small snapshot/scan JSON files back to the repo,
  separate from `app/**` to avoid deploying BoardgameEngine for each scan.
- If branch protection prevents the Actions bot from committing data, replace this
  GitHub state backend with a dedicated durable store; do not bypass protection.
- The Apify Actor is community-maintained, can break when Facebook changes, and
  is not an official Facebook Marketplace API.

Cost controls: `MAX_QUERIES_PER_RUN` defaults to 12; hard max 24. Each Actor
run has an estimated pay-per-event charge cap of $0.08, which is not an aggregate
monthly spending limit and may not include compute/proxy costs. Check and set
account-level spend limits on Apify before enabling high-volume scanning.
We should measure the real cost of one week of live data before increasing coverage.

Alert delivery: `data/alerts.json` is the outbound contract for the connected
ChatGPT scheduled alert check or another webhook notifier. **The GitHub workflow
alone does not push notifications**; alert delivery must be independently enabled
and tested after the first successful deployed scan. If the result file is missing,
no alert is considered delivered.

## Test

`node --test marketplace-monitor/*.test.mjs`

## Inputs / outputs

- `data/wishlist.json`: public BGG ID, title, priority, expansion flag, and sync timestamp.
- `data/seen.json`: deduplicated listing-ID / BGG-ID pairs and last recorded price.
- `data/alerts.json`: newly detected/changed matching listings from the most recent scan.
- `data/last-scan.json`: query coverage, errors, and counts.

For each alert: `listingId`, `bggId`, `game`, `priority`, `listing`,
`price`, `city`, and direct `url`.

BGG data attribution: [Powered by BoardGameGeek](https://boardgamegeek.com/).
