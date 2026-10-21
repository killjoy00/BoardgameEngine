import test from "node:test";
import assert from "node:assert/strict";
import { boardGameSearchInput } from "./search-config.mjs";
import { BOARD_GAME_RADIUS_KM, XBOX_RADIUS_KM, localListing } from "./match.mjs";
import { xboxListing } from "./logic.mjs";

test("rotating BGG queries search about 100 miles while Xbox remains 20 miles", () => {
  const inputs = [1, 2, 3, 4, 5, 6].map(priority =>
    boardGameSearchInput({ searchKeyword: "Board game title", priority })
  );
  for (const input of inputs) {
    assert.equal(input.radiusKm, BOARD_GAME_RADIUS_KM);
    assert.equal(input.radiusKm, 161);
    assert.equal(input.location, "Austin, Texas, United States");
    assert.equal(input.searchKeyword, "Board game title");
    assert.equal(input.maxPagesPerUrl, 1);
    assert.equal(input.strictFiltering, true);
    assert.equal(input.onlyNewListings, false);
    assert.equal(input.proxy.useApifyProxy, true);
  }
  assert.deepEqual(inputs.map(x => x.daysSinceListed), ["1", "1", "7", "7", "30", "7"]);
  assert.equal(XBOX_RADIUS_KM, 32.2);
  assert.equal(xboxListing({ title: "Xbox Series X", city: "San Antonio", state: "TX" }), false);
  assert.equal(xboxListing({ title: "Xbox Series X", city: "Austin", state: "TX" }), true);
  assert.equal(localListing({ city: "San Antonio", state: "TX" }, BOARD_GAME_RADIUS_KM), true);
});
