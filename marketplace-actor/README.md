# Independent Apify-managed Marketplace monitor

The source of the four-hour schedule moves off GitHub Actions onto **Apify schedules**.
This private Actor syncs the live authenticated BGG wishlist, reuses the existing
three high-priority game searches and the Xbox task, rotates eight additional
low-priority searches per cycle, matches locally, and sends relevant matches
directly using Resend. No browser or ChatGPT notification is involved.

## Geographic search scope

- **BGG board games**: search within **161 km (~100 miles)** of downtown
  Austin, Texas (including San Antonio, Waco, Temple/Killeen, College
  Station, Fredericksburg, and nearby towns).
- **Xbox pilot**: unchanged at **32 km (~20 miles)**. The two categories
  have separate match filters and the Xbox saved task retains its input.
- The three existing must-have BGG saved tasks must use `radiusKm=161` as
  well; those tasks run before the main Actor and provide its P1 datasets.
- Facebook's requested radius is only a hint: the Actor also verifies the
  returned item's city or available coordinates against the configured
  geographic boundary before emailing anything. City-only matches rely on a
  finite conservative Central Texas city allowlist; unknown locations are
  rejected rather than treated as local.
- Broader results do not imply a listing exists. The strict BGG title and
  edition/expansion checks remain in place. Email deduplication continues to
  use the existing persistent history, without starting a new baseline.

State is stored in the named **private Apify key-value store**
`bgg-marketplace-monitor-managed-v1`. It contains a BGG snapshot, seen listing
IDs/prices, a durable pending email outbox, health receipts, and a watchdog's
last-alert timestamp. It does **not** contain API credentials, recipient email
address, or email bodies. Resend idempotency keys guard retry duplication.

Apify automatically supplies a *limited-permission* `APIFY_TOKEN`. To reuse
existing private saved Actor tasks and read their datasets, the one-shot
GitHub deployment also securely provisions `APIFY_MANAGER_TOKEN` from its
existing `APIFY_API_TOKEN` repository secret. It also copies `BGG_API_TOKEN`,
`RESEND_API_KEY`, and `MARKETPLACE_ALERT_TO` into **encrypted Apify Actor
environment variables**.
None of those values are checked into the public repository.

The primary Apify schedule starts at minute 37 every fourth hour
in America/Chicago, after the existing Xbox (hourly +0) and priority-1
(hourly +10) schedules. Another Apify hourly schedule runs the `watchdog`
mode to email when scans are over six hours old. This guards missed *primary*
schedule ticks, though a total Apify outage would affect both. A second
independent provider may be added for that failure scenario.

This replaces GitHub's unreliable cron as the runtime trigger. GitHub remains
only for tests and a reviewed one-shot deployment workflow. The old GitHub
scheduled trigger must be disabled **after** this Actor and both Apify schedules
have been independently verified, to avoid duplicate emails.

- `src/main.mjs`: runtime Apify API calls, BGG sync, saved task dataset reads,
  bounded paid searches, persistent state and Resend sending.
- `src/logic.mjs`: shared tested BGG parser, query planner, price/area
  matching and outbox renderer.
- `src/match.mjs`: conservative game-title and location checks reused from
  the original monitor.
- `npm test` from this directory runs offline tests without using any keys.
