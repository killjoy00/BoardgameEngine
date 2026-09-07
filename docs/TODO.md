# Delivery TODO

## Current acceptance milestone — single-user live picker

- [x] Store the approved BGG application token only as GitHub/Cloudflare encrypted secrets.
- [x] Validate authenticated live Collection, Thing, and Search requests.
- [x] Use conservative request pacing and 20-ID Thing batches.
- [x] Persist linked BGG accounts, durable sync runs/items, game freshness, raw player-count polls, categories, and mechanics.
- [x] Reconcile BGG collection rows onto the same collection-item IDs used by private CSV import.
- [x] Keep collection/source titles separate from canonical Thing titles.
- [x] Refuse an unexpected empty Collection result before it can reconcile an existing shelf to empty.
- [x] Replace the fixture-first `/app` landing page with Connect → Sync → Pick.
- [x] Make recommendations from server-side cached owned games rather than browser-supplied candidates.
- [x] Show Best / Recommended / Not Recommended evidence and vote sample size on each result.
- [x] Exclude for-trade games by default with an explicit include toggle.
- [x] Add linked Powered by BGG attribution to the API-backed experience.
- [x] Support 2–7 and 8+ player tables, preferring the BGG `8+` poll and falling back to exact `8` when needed.
- [x] Add an explicit Either / Competitive / Cooperative table-style filter from normalized BGG mechanics.
- [ ] Sign in as the acceptance user and complete the first full `killjoy00` product sync.
- [ ] Compare synced ownership/status against the existing CSV-backed collection without overwriting private copy fields.
- [ ] Manually review real recommendation results across varied player counts, time limits, complexity bands, and table styles using the Recommendation Lab.
- [ ] Record `great` / `reasonable` / `wrong` labels for obviously good and bad rankings and use that evidence for the next Balanced-policy calibration pass.
- [ ] Review sync UX on mobile during a full ~665-game enrichment run and fix any remaining friction.

## Reliability and acceptance testing

- [x] Parser/domain/unit coverage for BGG auth header, Collection/Thing/Search parsing, batching, pacing, recommendation scoring, and sync identity helpers.
- [x] Compile-test the emitted picker-first browser JavaScript.
- [x] Compile-test the emitted Recommendation Lab browser JavaScript.
- [x] Keep destructive BGG reconciliation separated from app-owned copy metadata.
- [x] Maintain same-origin enforcement, browser security headers, output escaping, and magic-link rate limiting.
- [x] Maintain scheduled private D1 exports and documented restore/incident procedures.
- [x] Add structured redacted sync telemetry: duration, request attempts, retries, failed requests, omitted Thing IDs, and sanitized failure categories without logging private fields or tokens.
- [x] Validate the telemetry-enabled BGG adapter against the authenticated live BGG probe.
- [ ] Complete and record a production restore drill.
- [ ] Add authenticated browser-level end-to-end coverage for Connect → Sync → Pick once a dedicated non-production account/inbox is available.
- [ ] Add periodic full BGG reconciliation after first-sync behavior is proven.
- [ ] Decide whether incremental Collection refresh adds enough value versus simpler periodic full refreshes at the current user scale.

## Recommendation quality

- [x] Replace equal Best/Recommended treatment with a Balanced policy that gives Best votes more influence while preserving raw BGG evidence.
- [x] Replace the fixed `votes / 50` confidence ramp with smooth sample-size shrinkage toward a neutral prior.
- [x] Strengthen the explicit penalty for Not Recommended sentiment while keeping the raw downside visible.
- [x] Keep alternative Best-seat, Cautious, and Broad-positive policies in an admin calibration surface rather than exposing tuning modes to normal users.
- [x] Add an admin Recommendation Lab with a 63-scenario matrix and top-10 side-by-side policy comparisons.
- [x] Persist recommendation-quality feedback by exact scenario, policy, game, rank, and score.
- [x] Upgrade recommendation explanations to state Best share, downside share, vote count, and sample quality.
- [x] Improve fewer-than-five relaxation suggestions so they calculate how many games each relaxed constraint would actually add.
- [ ] Use real Lab feedback to calibrate the exact Balanced weights and prior strength; current values remain a tested starting policy, not gospel.
- [ ] Decide treatment of missing play time, missing weight, and missing exact-count poll values beyond the explicit 8+ fallback; never silently impute favorable data.
- [ ] Add saved table profiles only after the basic table controls and Balanced ranking prove credible in real use.
- [ ] Add collection coverage analysis only after recommendation filters/policies stabilize.

## Next major product capability — group libraries — intentionally paused

The group-library work remains the next major capability in the charter, but it is intentionally not being built during the current recommendation-quality phase.

- [ ] Model multiple public BGG source accounts participating in a table profile without conflating them with the signed-in user's private collection metadata.
- [ ] Deduplicate available games by BGG ID while retaining all owners.
- [ ] Show who owns each recommended game.
- [ ] Allow a host to temporarily include/exclude a participant's shelf for a game night.
- [ ] Run the same explainable picker against the combined available library.
- [ ] Add saved recurring groups/profiles after the one-off group flow is proven.

## Discovery helpers

- [ ] Upgrade the list matcher from local-only matching to BGG Search for unresolved names.
- [ ] Prefer exact BGG IDs/URLs and require manual review for ambiguity.
- [ ] Compare resolved IDs against the synced wishlist and wishlist priority.
- [ ] Validate a shareable five-game shortlist/table-vote flow after group libraries.

## Library Tools — preserve, do not lead roadmap

- [x] Private BGG CSV upload, quoted-field parsing, review, confirmed import, and chunked large-import processing.
- [x] Searchable/filterable/sortable library with in-place private copy editing.
- [x] Missing-price, changed-cost, missing-copy, and import-history review workflows.
- [x] Copy-level acquisition costs and current known-cost coverage.
- [x] Trade allocation, history, detail, reversal, and Markdown/text/CSV exports.
- [x] Invitations, account data export/deletion, audit events, and security hardening.
- [ ] Reimport the owner's private CSV once more after live BGG sync and verify copy count, known total, price coverage, private fields, and review queues remain unchanged.
- [ ] Product-review whether these tools are actually used before adding significant new accounting/trade scope.

## Deliberately deferred

- BoardGameEngine-native play logging.
- Marketplace/payments/shipping.
- Public social-network features.
- Advertising or payments unless BGG commercial licensing is explicitly revisited first.
- Any unsupported/private BGG JSON endpoints or page scraping.
- AI/LLM training on BGG data.
