// Managed BGG -> Facebook Marketplace monitor, designed for GitHub Actions.
// Fetches only the selected queries from Apify; no session cookies or browser required.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { matchWishlist, searchTerm, localListing } from "./match.mjs";
import { emptyOutbox, enqueueAlerts } from "./delivery.mjs";

const directory = new URL("./data/", import.meta.url);
const wishPath = new URL("wishlist.json", directory);
const seenPath = new URL("seen.json", directory);
const reportPath = new URL("last-scan.json", directory);
const alertPath = new URL("alerts.json", directory);
const pendingPath = new URL("pending-email.json", directory);

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

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}
async function saveJson(path, data) {
  await mkdir(dirname(fileURLToPath(path)), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function apifyJson(url, token, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(45_000)
  });
  if (!resp.ok) {
    // URLs and response bodies can contain credentials; never echo them.
    throw new Error("Apify HTTP " + resp.status);
  }
  return resp.json();
}
async function scrapeQuery(query, token) {
  const input = {
    searchKeyword: query.searchKeyword,
    location: "Austin, Texas, United States",
    radiusKm: 32,
    sortBy: "creation_time_descend",
    // More comprehensive lookback for games checked less often than daily.
    daysSinceListed: query.priority <= 2 ? "1" : query.priority === 5 ? "30" : "7",
    getListingDetails: false,
    getAllListingPhotos: false,
    strictFiltering: true,
    maxPagesPerUrl: 1,
    onlyNewListings: false,
    proxy: { useApifyProxy: true }
  };
  const runUrl = "https://api.apify.com/v2/acts/Y0QGH7cuqgKtNbEgt/runs";
  const created = await apifyJson(runUrl + "?maxTotalChargeUsd=0.03", token, {
    method: "POST", body: JSON.stringify(input)
  });
  const runId = created.data?.id;
  if (!runId) throw new Error("Apify returned no run ID");
  let run = created.data;
  for (let i = 0; i < 24 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await wait(5000);
    run = (await apifyJson("https://api.apify.com/v2/actor-runs/" + encodeURIComponent(runId), token)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error("Apify run status: " + run.status);
  const datasetId = run.defaultDatasetId;
  if (!datasetId) throw new Error("Apify finished without a dataset");
  const data = await apifyJson("https://api.apify.com/v2/datasets/" + encodeURIComponent(datasetId) +
    "/items?clean=true&limit=150", token);
  if (!Array.isArray(data)) throw new Error("Unexpected Apify dataset response");
  return data.map(normalizeActorListing).filter(Boolean);
}
// These four Apify tasks already run on their own schedules. Fetch their
// datasets instead of paying to search the same items again.
const scheduledTasks = [
  { taskId: "jUYfv4bKyJr9qDfuY", bggId: 367150 },
  { taskId: "OCgyYehQSm8K24tfP", bggId: 380109 },
  { taskId: "ALjMVkp1UTpWXe817", bggId: 421006 },
  { taskId: "CzW5v08yZKJtmZTzY", bggId: "xbox" }
];

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
async function savedTaskResults(task, token) {
  const url = "https://api.apify.com/v2/actor-tasks/" + encodeURIComponent(task.taskId) +
    "/runs/last?status=SUCCEEDED";
  const run = (await apifyJson(url, token)).data;
  if (!run?.id || !run?.defaultDatasetId ||
      !Number.isFinite(Date.parse(run.finishedAt || "")) ||
      Date.now() - Date.parse(run.finishedAt) > 7 * 60 * 60 * 1000) {
    throw new Error("Saved Apify task has no recent successful run");
  }
  const data = await apifyJson("https://api.apify.com/v2/datasets/" +
    encodeURIComponent(run.defaultDatasetId) + "/items?clean=true&limit=150", token);
  if (!Array.isArray(data)) throw new Error("Unexpected saved task dataset");
  return { taskId: task.taskId, runId: run.id,
    results: data.map(normalizeActorListing).filter(Boolean) };
}

async function boundedMap(values, limit, work) {
  const out = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= values.length) return;
      try { out[i] = await work(values[i]); } catch (error) {
        out[i] = { error: String(error.message || error), results: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return out;
}

export async function monitor({
  slot, scrape = scrapeQuery, fetchSaved = savedTaskResults,
  token = process.env.APIFY_API_TOKEN
} = {}) {
  const wishlist = await readJson(wishPath, null);
  if (!wishlist || !Array.isArray(wishlist.games) || wishlist.games.length < 10 ||
      !Number.isFinite(Date.parse(wishlist.syncedAt)) ||
      Date.now() - Date.parse(wishlist.syncedAt) > 48 * 60 * 60 * 1000) {
    throw new Error("BGG wishlist snapshot missing, invalid or stale; refusing to scan");
  }
  if (!token && scrape === scrapeQuery) {
    throw new Error("APIFY_API_TOKEN is not configured in GitHub Actions secrets");
  }
  const interval = 4 * 60 * 60 * 1000;
  const currentSlot = Number.isInteger(slot) ? slot : Math.floor(Date.now() / interval);
  const maxQueries = Math.min(24, Math.max(2, Number(process.env.MAX_QUERIES_PER_RUN || 12)));
  const planned = selectQueries(wishlist.games, currentSlot, maxQueries);
  // P1 + Xbox are covered by the user's four already-running Apify tasks.
  // Search remaining wishlist priorities on rotation; avoid noisy broad searches.
  const coveredP1 = new Set(scheduledTasks.filter((t) => typeof t.bggId === "number").map((t) => t.bggId));
  const newMustHaves = wishlist.games.filter((g) => g.priority === 1 && !coveredP1.has(g.bggId))
    .map((g) => ({ searchKeyword: searchTerm(g), gameId: g.bggId, priority: 1 }));
  const queries = [...newMustHaves, ...planned.filter((q) => q.priority >= 2 && q.priority <= 5)]
    .slice(0, maxQueries);
  const applicableTasks = scheduledTasks.filter((t) => t.bggId === "xbox" ||
    wishlist.games.some((g) => g.bggId === t.bggId && g.priority === 1));
  const [attempts, scheduled] = await Promise.all([
    boundedMap(queries, 2, async (query) => ({
      query, results: await scrape(query, token)
    })),
    boundedMap(applicableTasks, 2, async (task) => ({
      task, ...(await fetchSaved(task, token))
    }))
  ]);
  const errors = [
    ...attempts.filter((a) => a.error).map((a) => "Search: " + String(a.error).slice(0, 100)),
    ...scheduled.filter((a) => a.error).map((a) => "Scheduled task: " + String(a.error).slice(0, 100))
  ];
  const completed = attempts.filter((a) => !a.error);
  const successfulTasks = scheduled.filter((a) => !a.error);
  if (!completed.length && !successfulTasks.length) {
    throw new Error("No successful Apify search or scheduled task; retaining previous state");
  }
  const searched = completed.flatMap((entry) => entry.results);
  const taskGames = successfulTasks.filter((a) => a.task.bggId !== "xbox")
    .flatMap((entry) => entry.results);
  const xbox = successfulTasks.filter((a) => a.task.bggId === "xbox")
    .flatMap((entry) => entry.results);
  const fetched = [...searched, ...taskGames];
  const matches = [...matchWishlist(wishlist.games, fetched), ...xboxMatches(xbox)];
  const prior = await readJson(seenPath, { ids: {} });
  const ids = prior.ids || {};
  const now = new Date().toISOString();
  // Quiet first-run baseline; later notify on fresh listing IDs or price changes.
  const isFirstScan = !prior.updatedAt;
  const fresh = isFirstScan ? [] : matches.filter((m) =>
    ids[m.listingId + ":" + m.bggId]?.price !== m.price);
  for (const m of matches) {
    ids[m.listingId + ":" + m.bggId] = { price: m.price, seenAt: now };
  }
  const cutoff = Date.now() - 60 * 86400000;
  for (const [key, value] of Object.entries(ids)) {
    if (Date.parse(value.seenAt || 0) < cutoff) delete ids[key];
  }
  const pending = await readJson(pendingPath, emptyOutbox());
  await saveJson(pendingPath, enqueueAlerts(pending, fresh, now));
  await saveJson(seenPath, { updatedAt: now, ids });
  const report = {
    checkedAt: now,
    wishlistSyncedAt: wishlist.syncedAt,
    wishlistCount: wishlist.games.length,
    dynamicQueriesAttempted: queries.length,
    dynamicQueriesCompleted: completed.length,
    existingTasksChecked: applicableTasks.length,
    existingTasksCompleted: successfulTasks.length,
    fetchedListings: fetched.length + xbox.length,
    matchedListings: matches.length,
    newMatches: fresh.length,
    firstScanBaseline: isFirstScan,
    errors
  };
  await saveJson(reportPath, report);
  await saveJson(alertPath, { checkedAt: now, matches: fresh });
  console.log("Marketplace scan:", JSON.stringify(report));
  return { report, matches: fresh };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  monitor().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
