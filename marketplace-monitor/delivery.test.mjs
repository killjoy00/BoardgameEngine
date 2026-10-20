import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyOutbox, enqueueAlerts, prepareBatch, acknowledgeBatch,
  renderEmail, normalizedAlert
} from "./delivery.mjs";
import { xboxMatches, xboxListing } from "./monitor.mjs";

const now = "2026-10-20T20:00:00.000Z";
const one = {
  listingId: "1077278561802556",
  bggId: "xbox",
  game: "Xbox",
  priority: null,
  listing: "Xbox Series X",
  price: "$450",
  city: "Austin",
  url: "https://www.facebook.com/marketplace/item/1077278561802556/"
};
const other = {
  listingId: "78901",
  bggId: 367150,
  game: "Dune: War for Arrakis",
  priority: 1,
  listing: "Dune: War for Arrakis board game",
  price: "$70",
  city: "Pflugerville",
  url: "https://www.facebook.com/marketplace/item/78901/"
};
test("queues valid matches once, without persisting any recipient or email body", () => {
  const queued = enqueueAlerts(emptyOutbox(), [one, one, other], now);
  assert.equal(Object.keys(queued.queue).length, 2);
  assert.equal(JSON.stringify(queued).includes("@gmail"), false);
  assert.equal(queued.queue["1077278561802556:xbox"].price, "$450");
  assert.equal(enqueueAlerts(queued, [one], now).queue["1077278561802556:xbox"].firstObservedAt, now);
});
test("rejects non-Facebook or malformed links before emailing", () => {
  assert.equal(normalizedAlert({ ...one, url: "https://notfacebook.com/marketplace/item/22" }, now), null);
  assert.equal(normalizedAlert({ ...one, url: "https://www.facebook.com/marketplace/item/22?q=secret" }, now)?.url,
    "https://www.facebook.com/marketplace/item/22");
  assert.equal(normalizedAlert({ ...one, listingId: "bad" }, now), null);
  assert.equal(normalizedAlert({ ...one, url: "https://www.facebook.com/marketplace/item/22/" }, now), null);
});
test("prepares a frozen batch and acknowledges only matching prices", () => {
  const original = enqueueAlerts(emptyOutbox(), [one], now);
  const prepared = prepareBatch(original, now);
  const id = prepared.activeBatch.id;
  assert.equal(prepared.activeBatch.items.length, 1);
  assert.equal(prepareBatch(prepared, "2026-10-20T20:30:00.000Z").activeBatch.id, id);
  const changed = enqueueAlerts(prepared, [{ ...one, price: "$400" }], "2026-10-20T21:00:00.000Z");
  assert.equal(changed.activeBatch.items[0].price, "$450");
  const acknowledged = acknowledgeBatch(changed, "2026-10-20T21:01:00.000Z");
  assert.equal(acknowledged.queue["1077278561802556:xbox"].price, "$400");
  assert.equal(prepareBatch(acknowledged, "2026-10-20T21:02:00.000Z").activeBatch.items[0].price, "$400");
  assert.deepEqual(acknowledgeBatch(prepared, now).queue, {});
});
test("renders a grouped transactional email with sanitized HTML", () => {
  const hostile = {
    ...other, listing: "<script>alert('bad')</script> board game"
  };
  const batch = prepareBatch(enqueueAlerts(emptyOutbox(), [one, hostile], now), now).activeBatch;
  const rendered = renderEmail(batch, "recipient@example.com", "Alerts <alerts@example.com>");
  assert.equal(rendered.to[0], "recipient@example.com");
  assert.match(rendered.subject, /2 new or changed listings/);
  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.html.includes("&lt;script&gt;"));
  assert.ok(rendered.text.includes("https://www.facebook.com/marketplace/item/78901/"));
});
test("accepts relevant local Xbox items and rejects distant false hits", () => {
  const rows = [
    { id: "1", title: "Xbox series x", city: "Austin", state: "TX", url: one.url, price: "$450" },
    { id: "2", title: "Xbox expansion card", city: "Buda", state: "TX", url: one.url, price: "$120" },
    { id: "3", title: "Xbox one", city: "San Antonio", state: "TX", url: one.url, price: "$40" },
    { id: "4", title: "Microphone", city: "Austin", state: "TX", url: one.url, price: "$10" }
  ];
  assert.equal(xboxListing(rows[0]), true);
  assert.deepEqual(xboxMatches(rows).map((r) => r.listingId), ["1", "2"]);
});
