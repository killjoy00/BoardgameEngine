// Public wishlist snapshot using BoardgameEngine's approved server-side BGG API access.
// No cookies, private collection fields, or BGG token are written to the repository.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const username = process.env.BGG_USERNAME || "killjoy00";
const out = new URL("./data/wishlist.json", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const root = /<items\\b([^>]*)>/.exec(xml)?.[1] ?? "";
  const total = /\\btotalitems="(\\d+)"/.exec(root)?.[1] ?? null;
  return {
    isCollectionXml: Boolean(root),
    declaredTotal: total === null ? null : Number(total),
    itemTags: [...xml.matchAll(/<item\\b/g)].length,
    parsedWishlistItems: parseWishlist(xml).length
  };
}

async function requestCollection(token, subtype = null, filtered = true) {
  const url = new URL("https://boardgamegeek.com/xmlapi2/collection");
  url.searchParams.set("username", username);
  if (filtered) url.searchParams.set("wishlist", "1");
  if (subtype) url.searchParams.set("subtype", subtype);
  for (let attempt = 1; attempt <= 8; attempt++) {
    if (attempt > 1) await sleep(Math.min(45_000, 5000 * attempt));
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/xml",
        "User-Agent": "BoardgameEngine/marketplace-wishlist-sync"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return response.text();
    if (![202, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error("BGG collection request failed: HTTP " + response.status);
    }
  }
  throw new Error("BGG collection remained unavailable after bounded retries");
}

export async function synchronize() {
  const token = process.env.BGG_API_TOKEN;
  if (!token) throw new Error("BGG_API_TOKEN GitHub secret must be configured");
  let prior = null;
  try {
    prior = JSON.parse(await readFile(out, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const age = Date.now() - Date.parse(prior?.syncedAt || 0);
  if (process.env.FORCE_BGG_SYNC !== "1" && age >= 0 && age < 20 * 60 * 60 * 1000) {
    console.log("BGG wishlist snapshot is fresh:", prior?.count, "games");
    return prior;
  }
  const filteredXml = await requestCollection(token);
  let games = parseWishlist(filteredXml);
  if (games.length < 10) {
    // Log only response SHAPE and counts. Never log collection XML, tokens,
    // private fields, user identifiers, or BGG response bodies.
    console.warn("Filtered BGG wishlist unusable:", collectionSummary(filteredXml));
    await sleep(5000);
    const fullXml = await requestCollection(token, null, false);
    games = parseWishlist(fullXml);
    console.log("Unfiltered BGG fallback:", collectionSummary(fullXml));
  }
  // Do not issue further source requests when BGG supplies a suspiciously small
  // collection: keep last verified snapshot and make the workflow fail visibly.
  if (games.length < 10 || (prior?.count && games.length < prior.count * 0.5)) {
    throw new Error("BGG response too small: " + games.length + " items; retaining previous snapshot");
  }
  // The BGG default collection response can label expansions as base games.
  // Classify using the expansion-only filtered view, with a bounded unfiltered
  // fallback if BGG returns an unexpectedly empty filtered expansion view.
  await sleep(5000);
  let expansionXml = await requestCollection(token, "boardgameexpansion");
  let expansionIds = new Set(parseWishlist(expansionXml).map((item) => item.bggId));
  if (!expansionIds.size) {
    console.warn("Filtered BGG expansion view empty:", collectionSummary(expansionXml));
    await sleep(5000);
    expansionXml = await requestCollection(token, "boardgameexpansion", false);
    expansionIds = new Set(parseWishlist(expansionXml).map((item) => item.bggId));
  }
  games = games.map((game) => ({
    ...game,
    isExpansion: game.isExpansion || expansionIds.has(game.bggId)
  }));
  const snapshot = {
    source: "BoardGameGeek XML API2",
    username,
    syncedAt: new Date().toISOString(),
    count: games.length,
    games
  };
  await mkdir(dirname(fileURLToPath(out)), { recursive: true });
  await writeFile(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("BGG wishlist synchronized:", games.length, "games; priorities",
    [1, 2, 3, 4, 5].map((p) => games.filter((g) => g.priority === p).length).join("/"));
  return snapshot;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  synchronize().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
