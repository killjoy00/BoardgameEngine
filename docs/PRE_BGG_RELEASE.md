# Pre-BGG release

This release deliberately delivers useful collection management before live BGG API approval.

## Included

- Authenticated CSV upload, quoted-field parsing, private preview, quantity resolution, and confirmed import.
- Copy-level collection storage, reimport removal review, real dashboard totals, and a missing-price queue.
- Invitation administration with send, resend, revoke, disable, and acceptance state.
- Auditable trade records, deterministic weighted cent allocation, reversible ownership changes, and Markdown, text, and CSV trade exports.
- A server-only BGG adapter boundary with XML fixtures, 20-item batching, and bounded queued/error retries.
- Deterministic fixture-driven recommendation ranking with visible sentiment, vote count, time, and exact player count.
- Pasted name, BGG ID, and BGG URL matching against locally imported games.

## Waiting for approval

The live Collection, Thing, and Search transports remain disabled until BGG supplies the approved Bearer token. The token will be stored only as a Cloudflare Worker secret. Live integration must not replace the fixture transport until contract fixtures have been captured and reviewed.

## Privacy boundary

Uploaded CSV contents are parsed on the authenticated request, previewed only to the owner, and normalized into D1 after confirmation. The original upload is not stored. Private comments, locations, acquisition sources, and prices must never be written to application logs.
