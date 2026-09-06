# BoardGameEngine

BoardGameEngine answers one practical question: **given the people at the table and the games actually available to us, what should we play?**

It connects to a public BoardGameGeek collection, caches canonical game data and exact-player-count community polls, then ranks owned games against the table's player count, time, and desired complexity. Every recommendation keeps the underlying Best / Recommended / Not Recommended evidence visible.

## Project status

Active invitation-only development. The BoardGameGeek application is approved and the Bearer token is deployed only as an encrypted server-side secret.

The live integration has successfully validated authenticated Collection, Thing, and Search calls. The acceptance account (`killjoy00`) currently returns 665 owned base games from BGG. The authenticated application now opens on a picker-first **Tonight** experience rather than the older collection-accounting workspace.

The current milestone is a full authenticated product sync followed by manual review and calibration of real recommendation shortlists.

## Product hierarchy

The core product is:

1. connect a public BGG username;
2. synchronize and cache the available shelf;
3. describe tonight's table; and
4. receive up to five explainable owned-game recommendations.

Existing cost tracking, private CSV import, trade accounting, exports, matcher, and administration remain available under **Library tools**. They are useful secondary capabilities, not the roadmap driver.

Group libraries—combining the public collections of everyone at the table—are the next major capability after the single-user picker is validated.

Play logging is deliberately outside the core product.

## Architecture

The authenticated application lives in `app/` and uses:

- Cloudflare Workers + Hono;
- Cloudflare D1;
- Resend invitation/magic-link authentication;
- a server-side BoardGameGeek XML API2 client;
- durable chunked BGG synchronization;
- cached raw exact-player-count poll data; and
- GitHub Actions deployment with TypeScript/Vitest checks before migrations and deploys.

The BGG application token never enters browser code.

## Local development

The public product site has no build-time dependencies:

```bash
npm start
npm run check
```

For the authenticated application:

```bash
cd app
npm ci
npx wrangler d1 migrations apply DB --local
npm run dev
npm run check
```

A local BGG token is required only for live API calls; normal parser/domain tests use fixtures and mocks.

## Start here

- [Project charter](docs/PROJECT_CHARTER.md) — current product thesis, architecture, data ownership, recommendation contract, roadmap, and confirmed decisions.
- [Feature status](docs/FEATURES.md) — what is implemented now.
- [Delivery TODO](docs/TODO.md) — next acceptance and product work.
- [Operations](docs/OPERATIONS.md) — deploy/restore/incident guidance.

BoardGameGeek remains the source for BGG-derived data. Public-facing API-backed experiences include the required linked Powered by BGG attribution.
