import test from "node:test";
import assert from "node:assert/strict";
import { parseWishlist, collectionSummary } from "./sync-wishlist.mjs";

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

test("BGG's unfiltered collection exposes wishlisted games without treating ownership as wishlist", () => {
  const xml = '<items totalitems="4" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">' +
    '<item objecttype="thing" objectid="100" subtype="boardgame" collid="5">' +
    '<name sortindex="1">An Owned Game</name><status own="1" wishlist="0" wishlistpriority="0" lastmodified="2026-10-18 00:00:00" /></item>' +
    '<item objecttype="thing" objectid="421006" subtype="boardgame" collid="6">' +
    '<name sortindex="1">Lord of the Rings: Duel for Middle-earth</name><status own="0" wishlist="1" wishlistpriority="1" lastmodified="2026-10-18 01:00:00" /></item>' +
    '<item objecttype="thing" objectid="223" subtype="boardgameexpansion" collid="7">' +
    '<name sortindex="1">An Expansion</name><status own="0" wishlist="1" wishlistpriority="4" /></item>' +
    '<item objecttype="thing" objectid="224" subtype="boardgame" collid="8">' +
    '<name sortindex="1">Not wishlisted</name><status own="0" wishlist="0" /></item></items>';
  assert.deepEqual(parseWishlist(xml).map(({ bggId, priority }) => ({ bggId, priority })), [
    { bggId: 223, priority: 4 }, { bggId: 421006, priority: 1 }
  ]);
  assert.deepEqual(collectionSummary(xml), {
    isCollectionXml: true, declaredTotal: 4, itemTags: 4, parsedWishlistItems: 2
  });
  assert.deepEqual(collectionSummary('<html><body>Not XML</body></html>'), {
    isCollectionXml: false, declaredTotal: null, itemTags: 0, parsedWishlistItems: 0
  });
});
