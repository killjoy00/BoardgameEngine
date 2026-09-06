# Pre-BGG release — archived

This document described the temporary collection-management release built while BoardGameGeek application approval was still pending.

That gate has passed. The approved application token is deployed as an encrypted server-side secret, authenticated Collection/Thing/Search access has been validated, persistent BGG synchronization is implemented, and the authenticated application now opens on a live picker-first experience.

The pre-approval release remains historically useful because it established:

- authenticated private BGG CSV upload and reconciliation;
- copy-level collection/cost storage;
- invitation administration;
- auditable trade records and exports;
- the initial BGG parser/batching test boundary; and
- security/privacy hardening.

Those capabilities are preserved as secondary **Library tools**. They no longer define the primary product roadmap.

For current direction, use:

- [PROJECT_CHARTER.md](PROJECT_CHARTER.md) — active product charter;
- [FEATURES.md](FEATURES.md) — current implemented feature state; and
- [TODO.md](TODO.md) — current delivery priorities.

## Privacy boundary retained from the pre-approval release

Uploaded private CSV contents are parsed on the authenticated request and normalized into D1 only after confirmation. The original upload is not retained. Private comments, locations, acquisition sources, and prices must not be written to application logs or overwritten by public BGG synchronization.
