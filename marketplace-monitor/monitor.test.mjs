import test from "node:test";
import assert from "node:assert/strict";
import { selectQueries, normalizeActorListing } from "./monitor.mjs";

const games = [
  { bggId: 1, name: "Dune: War for Arrakis", priority: 1 },
  { bggId: 2, name: "Gibberers", priority: 1 },
  { bggId: 3, name: "Lord of the Rings: Duel for Middle-earth", priority: 1 },
  ...Array.from({length: 10}, (_, i) => ({ bggId: 100 + i, name: "Test game " + i, priority: 2 })),
  ...Array.from({length: 50}, (_, i) => ({ bggId: 500 + i, name: "Lower priority title " + i, priority: 5 }))
];

test("planned search batch contains urgent games and rotates lower-priority games", () => {
  const first = selectQueries(games, 0, 10);
  const next = selectQueries(games, 1, 10);
  assert.equal(first.length, 10);
  assert.deepEqual(first.slice(0, 3).map((q) => q.priority), [1, 1, 1]);
  assert.notDeepEqual(first.filter((q) => q.priority === 2).map((q) => q.gameId),
    next.filter((q) => q.priority === 2).map((q) => q.gameId));
  assert.equal(first.at(-1).searchKeyword, "board games");
});

test("adding/removing wishlist games changes selected searches automatically", () => {
  const original = selectQueries(games, 0, 12);
  const modified = selectQueries([games[0], ...games.slice(2)], 0, 12);
  assert.ok(original.some((q) => q.gameId === 2));
  assert.ok(!modified.some((q) => q.gameId === 2));
});

test("normalizes nested Facebook fields without losing listing ID", () => {
  const result = normalizeActorListing({
    id: "1234",
    marketplace_listing_title: "Foundations of Rome Board Game",
    listing_price: { formatted_amount: "$120" },
    location: { reverse_geocode: { city: "Austin", state: "TX" } },
    creation_time: 1792444406,
    listingUrl: "https://www.facebook.com/marketplace/item/1234"
  });
  assert.deepEqual({
    id: result.id,
    title: result.title,
    price: result.price,
    city: result.city,
    state: result.state,
    createdAt: result.createdAt
  }, {
    id: "1234", title: "Foundations of Rome Board Game",
    price: "$120", city: "Austin", state: "TX", createdAt: 1792444406
  });
  assert.equal(normalizeActorListing({ id: "1" }), null);
});
