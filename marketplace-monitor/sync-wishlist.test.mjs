import test from "node:test";
import assert from "node:assert/strict";
import { parseWishlist } from "./sync-wishlist.mjs";

test("wishlist XML parser preserves IDs, names, priority and expansions", () => {
  const xml = '<?xml version="1.0"?><items totalitems="3">' +
    '<item objecttype="thing" objectid="367150" subtype="boardgame" collid="10">' +
    '<name sortindex="1">Dune: War for Arrakis</name><status own="0" wishlist="1" wishlistpriority="1" /></item>' +
    '<item objecttype="thing" objectid="344554" subtype="boardgameexpansion" collid="11">' +
    '<name>Décorum: Expansion &amp; More</name><status wishlist="1" wishlistpriority="2" /></item>' +
    '<item objecttype="thing" objectid="100" subtype="boardgame" collid="12">' +
    '<name>Not wishlisted</name><status wishlist="0" /></item></items>';
  assert.deepEqual(parseWishlist(xml), [
    { bggId: 344554, name: "Décorum: Expansion & More", priority: 2, isExpansion: true },
    { bggId: 367150, name: "Dune: War for Arrakis", priority: 1, isExpansion: false }
  ]);
});

test("empty/corrupt records never become search terms", () => {
  const xml = '<items><item objectid="missing"><name>Not id</name><status wishlist="1" /></item>' +
    '<item objectid="52"><name></name><status wishlist="1" /></item></items>';
  assert.deepEqual(parseWishlist(xml), []);
});
