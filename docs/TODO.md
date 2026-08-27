# Delivery TODO

## PR #15 review and polish

- [ ] Product-review every authenticated route on desktop and mobile before merge.
- [ ] Import the real private CSV through a review deployment and verify counts, totals, private fields, and the assumption that copies appear as separate rows.
- [ ] Review any changed-cost warning; never replace an application cost until the owner selects **Use imported**.
- [ ] Review any missing-copy warning; never change ownership until the owner selects **Mark no longer owned**.
- [ ] Confirm the searchable trade selection, incoming-game cards, allocation confirmation, BGG-ID requirement, reversal, and Markdown-first export with real examples.
- [ ] Confirm administrator invitation send, resend, revoke, disable, re-enable, and acceptance flows.
- [ ] Keep the fixture picker visible and unmistakably labeled as sample data.
- [ ] Run accessibility, responsive, privacy, authorization, and destructive-action checks.
- [ ] Merge PR #15 only after explicit owner approval; the main workflow will then apply migration `0002_collection.sql`.

## Immediately after BGG approval

- [ ] Store the Bearer token as an encrypted GitHub and Cloudflare Worker secret; never commit or log it.
- [ ] Record approval conditions, license terms, rate limits, and attribution requirements.
- [ ] Capture and sanitize real XML fixtures before enabling live synchronization.
- [ ] Implement Collection, Thing, and Search transports behind the tested adapter boundary.
- [ ] Run an initial `killjoy00` sync and compare it with the CSV import without overwriting app-owned fields.
- [ ] Validate exact player-count polls and select the final recommendation thresholds/policy using real games.
- [ ] Enable scheduled full reconciliation plus bounded incremental refresh.
- [ ] Replace fixture recommendations and local-only matching with live BGG-enriched behavior.

## Later hardening

- [x] Add account data export and confirmed deletion for non-administrator accounts.
- [x] Add a recent non-sensitive audit view and event trail for imports, invitations, trades, reversals, and exports.
- [x] Add magic-link rate limiting, expired-token cleanup, security headers, same-origin enforcement, and output escaping.
- [ ] Add backup/restore drills, structured redacted operational logs, and operational runbooks.
- [ ] Add browser-level end-to-end tests for imports, invitations, costs, trades, exports, matching, and recommendations.
