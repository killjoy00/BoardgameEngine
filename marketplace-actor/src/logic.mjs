import { createHash } from "node:crypto";
import { matchWishlist, searchTerm, localListing } from "./match.mjs";
const MAX_BATCH_ITEMS = 30;
const decode = (value) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const attribute = (s, key) =>
  new RegExp('(?:^|\\s)' + key + '="([^"]*)"').exec(s)?.[1] ?? "";

export function parseWishlist(xml) {
  const list = [];
  for (const match of xml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
    const head = match[1], body = match[2];
    const status = /<status\b([^>]*)\/?>/.exec(body)?.[1] ?? "";
    if (attribute(status, "wishlist") !== "1") continue;
    const id = Number(attribute(head, "objectid"));
    const nameRaw = /<name\b[^>]*>([\s\S]*?)<\/name>/.exec(body)?.[1] ?? "";
    const name = decode(nameRaw).trim();
    const rank = Number(attribute(status, "wishlistpriority"));
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    list.push({
      bggId: id,
      name,
      priority: Number.isInteger(rank) && rank >= 1 && rank <= 5 ? rank : 5,
      isExpansion: attribute(head, "subtype") === "boardgameexpansion"
    });
  }
  const unique = new Map(list.map((item) => [item.bggId, item]));
  return [...unique.values()].sort((a, b) => a.bggId - b.bggId);
}

// BGG's filtered Collection endpoint has previously returned HTTP 200 with
// zero usable wishlist records despite a nonempty public wishlist. A single
// unfiltered request is a safe fallback; it is filtered locally by status.
export function collectionSummary(xml) {
  // Aggregate metadata only; safe for GitHub Actions logs.
  const root = /<items\b([^>]*)>/.exec(xml)?.[1] ?? "";
  const total = /\btotalitems="(\d+)"/.exec(root)?.[1] ?? null;
  return {
    isCollectionXml: Boolean(root),
    declaredTotal: total === null ? null : Number(total),
    itemTags: [...xml.matchAll(/<item\b/g)].length,
    parsedWishlistItems: parseWishlist(xml).length
  };
}

export function selectQueries(games, slot, maxQueries = 12) {
  // A rotating subset prevents 367 individual queries every few hours.
  // Every update is reflected automatically because games come from the latest BGG snapshot.
  const caps = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 2 };
  const selections = [];
  for (let p = 1; p <= 5; p++) {
    const tier = games.filter((g) => g.priority === p).sort((a, b) => a.bggId - b.bggId);
    const cap = Math.min(caps[p], tier.length);
    if (!cap) continue;
    const offset = (Math.max(0, slot) * cap) % tier.length;
    for (let i = 0; i < cap; i++) selections.push(tier[(offset + i) % tier.length]);
  }
  const seenTerms = new Set();
  const queries = [];
  for (const game of selections) {
    const term = searchTerm(game);
    const key = term.toLowerCase();
    if (!term || seenTerms.has(key)) continue;
    seenTerms.add(key);
    queries.push({ searchKeyword: term, gameId: game.bggId, priority: game.priority });
    if (queries.length >= maxQueries - 1) break;
  }
  if (queries.length < maxQueries) queries.push({ searchKeyword: "board games", gameId: null, priority: 6 });
  return queries.slice(0, maxQueries);
}

export function normalizeActorListing(item) {
  if (!item?.id || !item?.marketplace_listing_title) return null;
  const loc = item.location || {};
  const location = loc.reverse_geocode || {};
  const coordinates = { latitude: loc.latitude, longitude: loc.longitude };
  return {
    id: String(item.id),
    title: String(item.marketplace_listing_title),
    price: item.listing_price?.formatted_amount || null,
    city: location.city || null,
    state: location.state || null,
    ...coordinates,
    createdAt: item.creation_time || null,
    url: item.listingUrl || "https://www.facebook.com/marketplace/item/" + item.id + "/"
  };
}

export function xboxListing(listing) {
  return localListing(listing) && /\bxbox\b/i.test(listing.title || "");
}
export function xboxMatches(listings) {
  return [...new Map(listings.filter(xboxListing).map((item) => [
    String(item.id), {
      listingId: String(item.id),
      bggId: "xbox",
      game: "Xbox",
      priority: null,
      listing: item.title,
      price: item.price,
      city: item.city,
      url: item.url
    }
  ])).values()];
}

export function emptyOutbox() {
  return { version: 1, updatedAt: null, queue: {}, activeBatch: null };
}
function safeMarketplaceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" ||
      !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(parsed.hostname) ||
      !/^\/marketplace\/item\/[0-9]+\/?$/.test(parsed.pathname)) return null;
    return parsed.origin + parsed.pathname;
  } catch { return null; }
}
export function normalizedAlert(input, now) {
  const listingId = String(input?.listingId || "");
  const bggId = String(input?.bggId ?? "");
  const url = safeMarketplaceUrl(input?.url);
  if (!/^[0-9]+$/.test(listingId) || !/^(xbox|[0-9]+)$/.test(bggId) || !url ||
      !url.endsWith("/" + listingId) && !url.endsWith("/" + listingId + "/") ||
      !String(input?.listing || "").trim()) return null;
  return {
    key: listingId + ":" + bggId,
    listingId,
    bggId,
    game: String(input?.game || "Xbox").slice(0, 200),
    priority: Number.isInteger(input?.priority) ? input.priority : null,
    listing: String(input.listing).slice(0, 240),
    price: input?.price == null ? null : String(input.price).slice(0, 50),
    city: String(input?.city || "Austin area").slice(0, 120),
    url,
    firstObservedAt: now
  };
}
export function enqueueAlerts(outbox, alerts, now) {
  const current = structuredClone(outbox || emptyOutbox());
  if (current.version !== 1) throw new Error("Unsupported email outbox version");
  current.queue ||= {};
  for (const item of alerts || []) {
    const alert = normalizedAlert(item, now);
    if (!alert) continue;
    const previous = current.queue[alert.key];
    if (previous?.price === alert.price) continue;
    current.queue[alert.key] = alert;
  }
  current.updatedAt = now;
  return current;
}
export function prepareBatch(outbox, now) {
  const next = structuredClone(outbox || emptyOutbox());
  if (next.activeBatch) return next;
  const rows = Object.values(next.queue || {}).sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, MAX_BATCH_ITEMS);
  if (!rows.length) return next;
  const id = createHash("sha256").update(JSON.stringify(rows.map((item) =>
    [item.key, item.price, item.firstObservedAt]
  ))).digest("hex").slice(0, 48);
  next.activeBatch = { id, preparedAt: now, items: rows };
  next.updatedAt = now;
  return next;
}
export function acknowledgeBatch(outbox, now) {
  const next = structuredClone(outbox);
  if (!next.activeBatch) return next;
  for (const item of next.activeBatch.items) {
    const queued = next.queue?.[item.key];
    if (queued?.price === item.price && queued?.firstObservedAt === item.firstObservedAt) {
      delete next.queue[item.key];
    }
  }
  next.activeBatch = null;
  next.lastSentAt = now;
  next.updatedAt = now;
  return next;
}
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export function renderEmail(batch, to, from) {
  if (!batch?.items?.length || !to || !from) throw new Error("Missing prepared email batch");
  const count = batch.items.length;
  const subject = "Marketplace: " + count + " new or changed listing" + (count === 1 ? "" : "s");
  const lines = ["New Marketplace matches near Austin", ""];
  for (const item of batch.items) {
    lines.push(item.game + (item.priority ? " (BGG priority " + item.priority + ")" : ""));
    lines.push(item.listing + " - " + (item.price || "Price not available") + " - " + item.city);
    lines.push(item.url, "");
  }
  lines.push("You're receiving this only when a new matching listing or meaningful price change is detected.");
  const rows = batch.items.map((item) =>
    '<li style="margin-bottom:16px"><strong>' + escapeHtml(item.game) +
    (item.priority ? " (priority " + item.priority + ")" : "") + '</strong>' +
    '<div>' + escapeHtml(item.listing) + '</div>' +
    '<div>' + escapeHtml(item.price || "Price not available") + ' · ' + escapeHtml(item.city) + '</div>' +
    '<div><a href="' + escapeHtml(item.url) + '">View Facebook Marketplace listing</a></div></li>'
  ).join("");
  const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5">' +
    '<h2>New Marketplace matches near Austin</h2><ul>' + rows + '</ul>' +
    '<p style="color:#666;font-size:13px">Only new matching listings or price changes generate an email.</p>' +
    '</body></html>';
  return { from, to: [to], subject, text: lines.join("\n"), html };
}
