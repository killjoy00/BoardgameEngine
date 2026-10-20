import test from "node:test";
import assert from "node:assert/strict";
import { matchListing, matchWishlist, normalize, searchTerm, titleVariants, localListing } from "./match.mjs";

const austin = (title, city = "Austin") => ({ id: "test-" + title, title, city, state: "TX", price: "$25", url: "https://www.facebook.com/marketplace/item/1/" });
const dune = { bggId: 367150, name: "Dune: War for Arrakis", priority: 1 };
const lotr = { bggId: 421006, name: "The Lord of the Rings: Duel for Middle-earth", priority: 1 };
const imm = { bggId: 367466, name: "Dune: Imperium – Immortality", priority: 2 };
const foundation = { bggId: 284189, name: "Foundations of Rome", priority: 2 };

test("high-priority exact and alias matches", () => {
  assert.equal(matchListing(dune, austin("Dune: War for Arrakis board game")), true);
  assert.equal(matchListing(lotr, austin("Lord of the Rings: Duel for Middle Earth Board Game")), true);
  assert.equal(matchListing(lotr, austin("Duel for Middle Earth")), true);
  assert.equal(matchListing(imm, austin("Dune Imperium Immortality Expansion")), true);
  assert.equal(matchListing(foundation, austin("Foundations of Rome Board Game", "Round Rock")), true);
});

test("avoid unrelated keywords and false positives", () => {
  assert.equal(matchListing(dune, austin("Cara Dune Star Wars Action Figure")), false);
  assert.equal(matchListing(imm, austin("Dune board game")), false);
  assert.equal(matchListing(foundation, austin("Makeup foundation and face powder")), false);
  assert.equal(matchListing(lotr, austin("Lord of the Rings duel figures")), false);
  assert.equal(matchListing(lotr, austin("The Lord of the Rings Duel for Middle-earth organizer insert")), false);
  assert.equal(matchListing(lotr, austin("Lord of the Rings: Duel for Middle-earth board game", "San Antonio")), false);
  assert.equal(matchListing(lotr, austin("Lord of the Rings: Duel for Middle-earth board game", "McKinney")), false);
});

test("geographical filter rejects national Facebook Marketplace suggestions", () => {
  assert.equal(localListing({ city: "Austin", state: "TX" }), true);
  assert.equal(localListing({ city: "McKinney", state: "TX" }), false);
  assert.equal(localListing({ city: "San Antonio", state: "TX" }), false);
  assert.equal(localListing({ city: "Seattle", state: "WA" }), false);
  assert.equal(localListing({ latitude: 30.2672, longitude: -97.7431, state: "TX" }), true);
  assert.equal(localListing({ latitude: 32.7767, longitude: -96.797, state: "TX" }), false);
});

test("matching deduplicates repeated listing ids and respects priority", () => {
  const result = matchWishlist([foundation, dune], [
    austin("Dune War for Arrakis board game"),
    austin("Foundations of Rome board game"),
    austin("Dune War for Arrakis board game")
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((x) => x.priority), [1, 2]);
});

test("stable search variants and normalization", () => {
  assert.equal(normalize("  Décorum  "), "decorum");
  assert.ok(titleVariants(lotr).some((s) => s.includes("Duel")));
  assert.ok(searchTerm({ name: "Cascadia" }).includes("board game"));
  assert.equal(titleVariants(imm).includes("Dune"), false);
});
