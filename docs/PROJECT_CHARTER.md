# BoardGameEngine Project Charter

**Status:** Active reboot charter  
**Version:** 1.0  
**Date:** 2026-09-06

## 1. Purpose

BoardGameEngine exists to answer one question exceptionally well:

> **Given the people at the table and the games actually available to us, what should we play?**

BoardGameGeek (BGG) remains the source of truth for game identity, community data, and public collection status. BoardGameEngine is the decision layer on top of that data.

The primary product is not collection accounting, trade bookkeeping, a BGG replacement, or another board-game database. It is a **game-night decision engine**.

A successful session should feel like:

**Sync shelf → describe table → receive five credible choices → understand why → choose a game.**

Everything else must either improve that loop or remain secondary.

## 2. Product thesis

A publisher player range answers whether a game *can* support a table size. The BGG `suggested_numplayers` poll contains a different and more useful signal: how the community actually feels about that exact player count, split into **Best**, **Recommended**, and **Not Recommended**.

BoardGameEngine combines that exact-count evidence with the user's real shelf, time available, and desired complexity. It must keep the evidence visible rather than hiding it behind a proprietary score.

The product should make choosing easier, not replace the group's judgment.

## 3. Product hierarchy

| Tier | Product area | Direction |
|---|---|---|
| Core | BGG synchronization | Build and harden now |
| Core | Exact-table recommendation engine | Build and calibrate now |
| Core | Mobile-first live picker | Build and validate now |
| Core | Explainable recommendations | Build and validate now |
| High value | Combined/group libraries | Next major product capability |
| High value | Saved table profiles | After the single-user picker is credible |
| High value | Shareable shortlist / table vote | Validate after live picker |
| Supporting | Wishlist/list matcher | Keep; upgrade with BGG Search |
| Supporting | Collection explorer | Keep |
| Secondary | Private BGG CSV import | Keep for data unavailable through public API |
| Secondary | Cost tracking and trade ledger | Preserve; freeze major expansion until core product is validated |
| Optional later | BGG play-history signals | Consider without adding BoardGameEngine play logging |
| Out of scope | Marketplace, payments, social network, BGG replacement | Do not build |

## 4. Core user experience

### Connect the shelf

An invited user supplies a public BGG username. BoardGameEngine synchronizes owned base games server-side through the approved XML API2 application token.

The browser never receives the BGG application token.

Collection/source titles are retained separately from canonical Thing titles. This matters in real data: the same BGG ID may appear under a collection-facing title such as `6 nimmt!` while Thing's primary canonical title is `Take 5`.

### Sync and enrich

Collection synchronization establishes availability and BGG statuses. Thing enrichment supplies canonical metadata and the exact-player-count poll.

The first sync may require many Thing batches. Sync progress must therefore be durable, resumable, and visible rather than held inside one long browser or Worker request.

The picker normally reads cached D1 data and makes **zero BGG requests**.

### Describe tonight's table

The initial picker asks for:

- exact player count;
- available time;
- desired complexity range; and
- whether games marked for trade may be considered.

Games marked for trade are excluded by default.

### Get a shortlist

BoardGameEngine returns up to five games actually owned by the user. Every result shows the relevant BGG vote sample and its Best / Recommended / Not Recommended distribution.

If fewer than five games satisfy the hard constraints, the product returns fewer than five and offers explicit possible relaxations. It never silently violates a hard filter.

## 5. BGG integration contract

BoardGameEngine uses the approved BGG application token only from the server and follows the official XML API2 path.

### Collection

Collection is used for public ownership and relevant collection statuses.

Base games are requested deliberately with the documented expansion workaround rather than relying on the default subtype behavior.

A full collection response that unexpectedly contains zero owned base games is treated as unsafe and does **not** reconcile an existing shelf to empty. The user is asked to check the username or collection visibility instead.

Full reconciliation may change BGG-sourced collection status, but it must never delete or overwrite app-owned copy prices, private notes, trade history, or other private CSV data.

### Thing

Thing provides canonical metadata and community poll data.

- At most 20 IDs are requested per Thing call.
- Requests are paced conservatively.
- Canonical game data is cached globally because the same BGG game can serve many users.
- Exact-player-count vote counts are stored raw.
- Categories and mechanics are normalized for later filtering and analysis.

### Search

Search is available for future live resolution of pasted names. Exact BGG IDs and URLs take precedence over title matching. Ambiguous names must require review rather than silent guessing.

### User and Plays

Public User data may later help validate connected usernames.

BGG play history is not part of the MVP. It may become an optional recommendation signal for users who already record plays on BGG. BoardGameEngine will not require play logging or become another play tracker.

## 6. Data ownership

The database distinguishes three kinds of information.

### BGG-sourced data

- canonical game identity and metadata;
- public collection status;
- exact-count community polls;
- BGG categories and mechanics; and
- freshness/synchronization timestamps.

### BoardGameEngine-derived data

- recommendation scores;
- confidence/sample-size adjustments;
- fit labels and warnings;
- group-library availability; and
- future coverage analysis.

### User-owned application data

- private CSV fields;
- copy-level acquisition costs;
- private notes and locations;
- trade ledger/history;
- saved profiles and preferences; and
- other app-only metadata.

BGG synchronization may refresh BGG-sourced data. It must not overwrite user-owned application data.

## 7. Recommendation contract

For game `g` at exact player count `p`, retain:

- `B(g,p)`: Best votes;
- `R(g,p)`: Recommended votes;
- `N(g,p)`: Not Recommended votes; and
- `T(g,p) = B + R + N`: total votes.

Derived signals may include:

- positive share: `(B + R) / T`;
- best share: `B / T`;
- negative share: `N / T`; and
- a sample-size confidence adjustment.

### Hard eligibility

Before ranking, a candidate must:

1. be owned in the selected library;
2. support the requested player count within its published range;
3. fit the requested time limit;
4. fit the requested complexity range;
5. have usable enriched BGG metadata and an exact-count poll; and
6. satisfy collection-status choices such as the for-trade toggle.

Unknown BGG values are not silently converted into favorable values. For example, BGG weight `0` is treated as missing rather than as an extremely light game.

### Initial balanced ranking

The current starting policy rewards broad positive sentiment, penalizes Not Recommended sentiment, and shrinks confidence for small samples. It is a **starting model, not gospel**.

The production ranking must be calibrated against real `killjoy00` recommendations across varied table scenarios before adding multiple policy modes or a large set of tuning controls.

### Explanation contract

Every result should answer:

- Why did this game qualify?
- What is its exact-count Best / Recommended / Not Recommended distribution?
- How many people voted?
- Is the sample small or the result divisive?
- What constraint could be relaxed to see more choices?

Raw BGG evidence remains visible. A BoardGameEngine score must never masquerade as a BGG rating.

## 8. Group libraries

After the single-user picker produces credible results, BoardGameEngine should support multiple public BGG collections in one table profile.

The host can add the BGG usernames of people whose games may be available that night. Games are deduplicated by BGG ID while ownership remains visible.

The product then answers the more useful real-world question:

> **What can this group play from everything physically available to us?**

This is expected to become a major differentiator.

## 9. Saved table profiles

After group libraries, users may save common contexts such as:

- “Tuesday — four-player strategy night”;
- “two-player weeknight”; or
- “family afternoon.”

A profile may retain participating collections, player count, time range, complexity range, recommendation policy, and optional exclusions.

Profiles reduce setup friction; they do not alter BGG data.

## 10. Existing Library Tools

The pre-reboot work is not discarded. It becomes a secondary **Library Tools** area.

Preserved capabilities include:

- private BGG CSV import and reconciliation;
- copy-level cost tracking and missing-price review;
- private condition/location/notes;
- auditable trade allocation and reversal;
- Markdown/text/CSV trade exports;
- invitations and account administration; and
- local list matching.

Private CSV remains useful because an application-level BGG token does not grant arbitrary access to a user's private BGG collection fields.

No major new accounting or trade feature should outrank core recommendation work until usage demonstrates otherwise.

## 11. Selected architecture

The technology decision is complete.

- **Runtime:** Cloudflare Workers
- **Web/API framework:** Hono
- **Database:** Cloudflare D1
- **Authentication:** invitation-only email magic links through Resend
- **Public product site:** GitHub Pages on the canonical domain
- **BGG integration:** server-side XML API2 client with encrypted Worker token
- **Deployment:** GitHub Actions, with TypeScript/Vitest checks before migration/deploy steps
- **Backups:** scheduled private D1 export workflow

Internal direction:

```text
BGG client
  → XML parsers
  → durable synchronization service
  → normalized D1 cache
  → recommendation service
  → authenticated API
  → picker-first web UI
```

The BGG client, synchronization API, recommendation API, and picker UI should remain separate boundaries instead of being folded back into the older monolithic application API.

## 12. Current implementation state

As of September 6, 2026:

- the BGG application token is stored in GitHub and deployed as an encrypted Cloudflare Worker secret;
- live authenticated Collection, Thing, and Search calls have been validated successfully;
- the live acceptance probe found **665 owned base games** for BGG user `killjoy00`;
- the live API client uses Bearer authentication, bounded retries, conservative pacing, and max-20 Thing batches;
- D1 stores linked source accounts, durable sync runs/items, canonical game freshness, exact-player-count polls, and category/mechanic tags;
- collection reconciliation reuses the same collection IDs as private CSV imports so app-owned copy records survive sync;
- `/app` is now a picker-first Connect → Sync → Pick experience;
- the live picker queries cached server-side collection data rather than accepting candidate games from the browser;
- the required linked Powered by BGG attribution is present on the API-backed experience; and
- the existing Library Tools remain available separately.

The next acceptance milestone is an authenticated `killjoy00` full sync through the product UI followed by manual review of real recommendation shortlists.

## 13. Delivery sequence

### Phase 0 — Live API proof — complete

- validate approved Bearer token;
- exercise Collection, Thing, and Search;
- confirm pacing and 20-ID Thing batching;
- capture normalized live evidence without exposing the token.

### Phase 1 — Real single-user product — in progress

- run the first full authenticated `killjoy00` product sync;
- compare synced collection identity/status with existing CSV-derived records;
- review several real picker scenarios;
- calibrate recommendation policy against those results;
- improve sync/error UX where real use exposes friction;
- add browser-level acceptance coverage once a suitable authenticated test account is available.

### Phase 2 — Group game night

- add multiple public BGG usernames to a table/library context;
- deduplicate by BGG ID while showing owners;
- recommend from the combined physically available shelf;
- add saved table profiles.

### Phase 3 — Discovery helpers

- upgrade the list matcher through live BGG Search;
- compare resolved IDs against synced wishlists;
- validate shareable shortlists and optional group voting.

### Phase 4 — Reassess Library Tools

Measure whether cost tracking, trade accounting, and exports are actually being used. Invest, simplify, or stop based on observed value rather than sunk-cost momentum.

## 14. Success criteria

BoardGameEngine is succeeding when a collector with a large BGG shelf can:

1. connect a username;
2. synchronize the shelf without managing API details;
3. describe tonight's table in seconds;
4. receive a trustworthy shortlist immediately from cached data; and
5. understand the evidence behind every recommendation.

A large collection should make the product more useful, not more cumbersome.

The product must remain useful without entering prices, trades, private notes, or play logs.

## 15. Non-goals

BoardGameEngine will not:

- replace BGG as a canonical database or collection editor;
- become a marketplace, store, payment service, or general social network;
- require BoardGameEngine play logging;
- scrape BGG pages or depend on unsupported private JSON endpoints;
- send the BGG application token to the browser;
- train an AI/LLM on BGG data; or
- monetize BGG-derived functionality without first resolving BGG's applicable commercial-license requirements.

## 16. Compliance and operations

- Keep the BGG application token server-side and encrypted.
- Cache BGG data and minimize request volume.
- Pace requests conservatively and batch Thing IDs at 20 or fewer.
- Preserve the last usable cached data through temporary BGG failures.
- Include a legible linked **Powered by BGG** logo on public-facing BGG-powered experiences.
- Treat BGG policy/API changes as an operational risk and keep the adapter boundary testable.
- Keep the initial product non-commercial unless licensing is explicitly revisited.

Official references:

- [Using the XML API](https://boardgamegeek.com/using_the_xml_api)
- [BGG XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2)
- [XML API Terms of Use](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use)

## 17. Confirmed product decisions

1. The picker is the product; collection accounting is secondary.
2. BGG is canonical for BGG-sourced identity/community/collection data.
3. BoardGameEngine preserves app-owned private/copy data across BGG syncs.
4. The initial recommendation personality is Balanced and must be calibrated against real results.
5. Games marked for trade are excluded by default, with an explicit include toggle.
6. Group libraries are the next major capability after the single-user picker is validated.
7. Play history is optional later; BoardGameEngine will not require play logging.
8. The initial release remains invitation-only and non-commercial.
9. Existing cost/trade tooling stays available but does not drive the roadmap.

## 18. Immediate definition of done

The reboot's first real product milestone is complete when `killjoy00` can sign in, complete a full live collection sync, enter several real table configurations, and receive credible five-game recommendations generated entirely from synchronized cached data.

The results must then be reviewed manually before the recommendation model is treated as settled.
