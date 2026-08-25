# BoardGameEngine

BoardGameEngine is a collection-first web app for answering a practical question: **what should this group play right now?**

The initial product will use a BoardGameGeek collection as its source catalog, then improve on printed player ranges by ranking games against the full community vote at the exact table size. It will also make for-trade inventory easier to maintain and export, and compare pasted game lists against a wishlist.

## Project status

Planning. The first release is intended to be invitation-only, with BGG user `killjoy00` as the discovery and acceptance-test account. The initial product will be non-commercial; advertising is out of scope. No technology stack has been selected and no production code has been written.

## Core jobs

- Enter a player count plus optional weight and time constraints; receive five owned-game recommendations with understandable reasons.
- Track copy-level acquisition costs, identify missing prices, total the known investment in the current collection, and rank copies by cost.
- Record a trade and allocate outgoing-game costs plus shipping across the games received.
- Track copies offered for trade, including condition and edition notes, and export a clean shareable list in one click.
- Paste game names or BoardGameGeek links and find confirmed or possible matches on the user's wishlist.

Play logging is deliberately outside the current scope.

## Start here

Read the [project charter and delivery plan](docs/PROJECT_CHARTER.md). It records the product scope, BoardGameGeek data findings, proposed recommendation model, phased roadmap, risks, and decisions still to make.
