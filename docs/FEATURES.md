# Feature status

## Included in PR #15

- **Private collection import:** CSV upload, quoted-field parsing, preview, quantity resolution, confirmed import, private metadata, and no retained source file.
- **Review queues:** missing prices, changed imported costs, and copies absent from a later import.
- **Library dashboard:** active copies, known cost, priced-copy coverage, and import onboarding.
- **Invitations:** administrator send, resend, revoke, disable, re-enable, and acceptance status.
- **Trade accounting:** searchable active-copy selection, required BGG IDs for incoming games, shipping/cash input, equal or relative weighting, deterministic minor-unit allocation, durable history, and reversal support.
- **Trade exports:** Markdown is the primary one-click format; plain text and CSV remain available.
- **Recommendation preview:** visible fixture-only picker, exact player-count eligibility, time/weight filters, confidence-aware scoring, and downside warnings above 10% (caution) and at or above 15% (high downside).
- **Local list matcher:** pasted names, BGG IDs, and BGG URLs matched against imported local games.
- **BGG adapter foundation:** synthetic XML fixtures, Thing poll parsing, 20-ID batching, and bounded retry/backoff behavior.

## Pending BGG approval

- Authenticate server-side XML API2 requests with the approved Bearer token.
- Capture sanitized Collection, Thing, Search, queued `202`, and error fixtures from `killjoy00`.
- Sync public collection statuses and reconcile full refreshes without overwriting app-owned costs or private metadata.
- Enrich imported games with canonical names, images, categories, mechanics, ranks, weights, times, expansion relationships, and community polls.
- Replace fixture candidates with the owner's collection and show five live, explainable recommendations.
- Resolve unknown pasted names through BGG Search while preserving explicit ambiguity review.
- Validate actual throttling, batching, backoff, freshness, attribution, and deletion reconciliation behavior.
