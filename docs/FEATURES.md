# Feature status

## Core product — live BGG decision engine

### Live BoardGameGeek integration

- **Approved token boundary:** BGG application token stays in GitHub/Cloudflare secrets and is sent only from the Worker as a Bearer token.
- **Live transport:** Collection, Thing, and Search have been exercised successfully against the approved API access.
- **Request discipline:** conservative five-second pacing, bounded retry handling for queued/throttled/transient responses, and max-20 Thing batches.
- **Durable synchronization:** linked source accounts, sync runs, per-game sync items, resumable enrichment progress, and last-sync/error state in D1.
- **Collection reconciliation:** public BGG collection status is reconciled without overwriting app-owned private CSV/copy fields.
- **Empty-result protection:** an unexpected zero-game Collection response is rejected before existing BGG-sourced ownership can be reconciled away.
- **Canonical enrichment:** game primary name, year, player range, play time, weight, image references, categories, mechanics, and freshness timestamp.
- **Exact player-count evidence:** raw Best / Recommended / Not Recommended vote counts are stored per BGG ID and player-count row.
- **Source-name preservation:** the collection-facing title remains available separately when BGG Thing's canonical primary name differs.
- **Shared cache:** recently enriched canonical game data can be reused across users instead of refetched per shelf.

The live validation collection for BGG user `killjoy00` contains 665 owned base games.

### Picker-first application home

- `/app` and `/app/picker` now open the **Tonight** workflow rather than the collection-accounting dashboard.
- Connect a public BGG username from the authenticated application.
- Start or resume a durable collection sync with visible progress.
- Choose exact player count, time available, and complexity range.
- Exclude games marked for trade by default or include them explicitly.
- Recommendations are generated server-side from cached owned-game data; the browser no longer supplies the candidate list.
- Hard player/time/weight filters are applied before ranking.
- BGG weight `0` is treated as missing data rather than a favorable light-game value.
- Return up to five results without silently relaxing constraints.
- Show vote count and Best / Recommended / Not Recommended percentages for every result.
- Show collection/source title when it differs from the canonical game title.
- Offer explicit relaxation ideas when fewer than five games qualify.
- Link each result back to its BoardGameGeek game page.
- Include the required linked Powered by BGG attribution.

### Recommendation policy

The current Balanced starting policy:

- combines Best + Recommended as positive sentiment;
- penalizes Not Recommended share;
- reduces confidence for small vote samples;
- keeps the raw poll evidence visible; and
- flags elevated downside.

This policy is intentionally provisional until it is calibrated against real full-collection recommendations.

## Library tools — preserved secondary capabilities

- **Private collection import:** CSV upload, quoted-field parsing, preview, quantity resolution, confirmed import, private metadata, and no retained source file.
- **Large imports:** bounded confirmation chunks with progress and actionable failures.
- **Review queues:** missing prices, changed imported costs, and copies absent from later imports.
- **Library explorer:** search by title/BGG ID, filters, sorting, and in-place private copy editing.
- **Cost dashboard:** active copies, known current-collection cost, priced-copy coverage, and missing-price workflow.
- **Trade accounting:** searchable outgoing copies, required BGG IDs for incoming games, shipping/cash input, deterministic minor-unit allocation, history, and reversal.
- **Trade exports:** Markdown-first plus plain text and CSV.
- **Local matcher:** pasted names, BGG IDs, and BGG URLs matched against local imported games.
- **Invitations:** administrator send, resend, revoke, disable, re-enable, and acceptance status.

## Security, privacy, and operations

- Same-origin enforcement for state-changing requests.
- Frame, MIME-sniffing, referrer, permissions, and content-security headers.
- Neutral per-address and per-email magic-link rate limits.
- Expired login/rate-limit cleanup.
- Server-side input validation for imports, reviews, invitations, trades, BGG usernames, and picker constraints.
- Escaped server output and DOM-safe rendering for dynamic BGG result text.
- Compile tests for emitted browser JavaScript.
- Owner-scoped account data export and confirmed deletion for non-administrator accounts.
- Recent non-sensitive audit events.
- Weekly private D1 export workflow plus restore/incident documentation.

## Not yet complete

- First full authenticated `killjoy00` sync through the product UI.
- Manual calibration of the recommendation formula against real shortlists.
- Browser-level authenticated end-to-end automation.
- Scheduled/periodic BGG reconciliation after first-sync behavior is validated.
- Live BGG Search integration for unresolved list-matcher names.
- Combined group libraries.
- Saved table profiles.
- Shareable shortlist/table voting.

See [PROJECT_CHARTER.md](PROJECT_CHARTER.md) for the current product hierarchy and [TODO.md](TODO.md) for delivery order.
