# BoardGameEngine

BoardGameEngine is a collection-first web app for answering a practical question: **what should this group play right now?**

The initial product will use a BoardGameGeek collection as its source catalog, then improve on printed player ranges by ranking games against the full community vote at the exact table size. It will also make for-trade inventory easier to maintain and export, and compare pasted game lists against a wishlist.

## Project status

Early development. The repository includes a responsive static product site suitable for BGG application review and initial deployment. The first release is intended to be invitation-only, with BGG user `killjoy00` as the discovery and acceptance-test account. The initial product will be non-commercial; advertising is out of scope.

## Run the public site

The public site has no build-time dependencies and can be deployed directly to any static host. Run `npm start`, open [http://localhost:3000](http://localhost:3000), and use `npm run check` for source checks.

The authenticated Cloudflare application lives in `app/`. Run `cd app`, `npm ci`, `npx wrangler d1 migrations apply DB --local`, and `npm run dev` for local development; use `npm run check` for its TypeScript and unit-test suite. See the [pre-BGG release notes](docs/PRE_BGG_RELEASE.md) for the features that work without live API access.

## Core jobs

- Enter a player count plus optional weight and time constraints; receive five owned-game recommendations with understandable reasons.
- Track copy-level acquisition costs, identify missing prices, total the known investment in the current collection, and rank copies by cost.
- Record a trade and allocate outgoing-game costs plus shipping across the games received.
- Track copies offered for trade, including condition and edition notes, and export a clean shareable list in one click.
- Paste game names or BoardGameGeek links and find confirmed or possible matches on the user's wishlist.

Play logging is deliberately outside the current scope.

## Start here

Read the [project charter and delivery plan](docs/PROJECT_CHARTER.md). It records the product scope, BoardGameGeek data findings, proposed recommendation model, phased roadmap, risks, and decisions still to make.
