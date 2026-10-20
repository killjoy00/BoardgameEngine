// Runs entirely on Apify (no GitHub Actions schedule or ChatGPT email connector).
// Secrets are injected as encrypted Apify Actor environment variables by the
// one-time reviewed GitHub deployment workflow.
import { matchWishlist } from "./match.mjs";
import {
  parseWishlist, collectionSummary, selectQueries, normalizeActorListing,
  xboxMatches, emptyOutbox, enqueueAlerts, prepareBatch, acknowledgeBatch, renderEmail
} from "./logic.mjs";

const API = "https://api.apify.com/v2";
const TASKS = [
  { taskId: "jUYfv4bKyJr9qDfuY", bggId: 367150 },
  { taskId: "OCgyYehQSm8K24tfP", bggId: 380109 },
  { taskId: "ALjMVkp1UTpWXe817", bggId: 421006 },
  { taskId: "CzW5v08yZKJtmZTzY", bggId: "xbox" }
];
const PROXY = { useApifyProxy: true };
// A hosted Actor's APIFY_TOKEN has limited permissions and cannot read
// the user's existing saved Marketplace tasks. The dedicated private Actor
// receives an encrypted owner-provisioned token at deployment time.
const TOKEN = process.env.APIFY_MANAGER_TOKEN || process.env.APIFY_TOKEN;
const USERNAME = "killjoy00";
const STATE_NAME = "bgg-marketplace-monitor-managed-v1";
const MAX_EMAIL_RETRY_MS = 20 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireSecret(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + " missing from encrypted Actor environment");
  return value;
}

async function rawApify(path, { method = "GET", body, allow404 = false } = {}) {
  if (!TOKEN) throw new Error("Apify runtime credential not available");
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: "Bearer " + TOKEN,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000)
  });
  if (response.status === 404 && allow404) return null;
  if (!response.ok) {
    // Never log response bodies, API token, recipient or full URL.
    throw new Error("Apify " + method + " " + path.split("?")[0] + " HTTP " + response.status);
  }
  return response;
}
async function data(path, options) {
  const response = await rawApify(path, options);
  return (await response.json()).data;
}

async function openState() {
  const record = await data("/key-value-stores?name=" + encodeURIComponent(STATE_NAME),
    { method: "POST" });
  if (!record?.id) throw new Error("Named Apify KV state was not available");
  const id = encodeURIComponent(record.id);
  return {
    async get(key, fallback = null) {
      const res = await rawApify("/key-value-stores/" + id + "/records/" +
        encodeURIComponent(key), { allow404: true });
      return res ? await res.json() : fallback;
    },
    async put(key, value) {
      await rawApify("/key-value-stores/" + id + "/records/" +
        encodeURIComponent(key), { method: "PUT", body: value });
    }
  };
}

async function xmlCollection(subtype = null, filtered = true) {
  const url = new URL("https://boardgamegeek.com/xmlapi2/collection");
  url.searchParams.set("username", USERNAME);
  if (filtered) url.searchParams.set("wishlist", "1");
  if (subtype) url.searchParams.set("subtype", subtype);
  for (let attempt = 1; attempt <= 8; attempt++) {
    if (attempt > 1) await sleep(Math.min(40_000, 5000 * attempt));
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + requireSecret("BGG_API_TOKEN"),
        Accept: "application/xml",
        "User-Agent": "BGGMarketplaceApify/1.0"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return response.text();
    if (![202, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error("BGG collection request failed: HTTP " + response.status);
    }
  }
  throw new Error("BGG did not provide collection XML after bounded retries");
}
async function currentWishlist(store, now) {
  const previous = await store.get("WISHLIST");
  const age = now - Date.parse(previous?.syncedAt || "");
  if (Number.isFinite(age) && age >= 0 && age < 20 * 3600_000 &&
      Array.isArray(previous?.games) && previous.games.length > 10) return previous;
  const filtered = await xmlCollection();
  let games = parseWishlist(filtered);
  if (games.length < 10) {
    console.warn("BGG filtered XML unusable:", JSON.stringify(collectionSummary(filtered)));
    await sleep(5000);
    const unfiltered = await xmlCollection(null, false);
    games = parseWishlist(unfiltered);
    console.log("BGG unfiltered fallback:", JSON.stringify(collectionSummary(unfiltered)));
  }
  if (games.length < 10 || (previous?.games?.length && games.length < previous.games.length / 2)) {
    // No silent empty-wishlist replacement. A long outage is not evidence that
    // the user removed games, and searches must not use old data indefinitely.
    throw new Error("BGG wishlist unexpectedly empty or shrunk; last good snapshot retained");
  }
  await sleep(5000);
  const expansion = await xmlCollection("boardgameexpansion");
  const expansionIds = new Set(parseWishlist(expansion).map((g) => g.bggId));
  games = games.map((g) => ({ ...g, isExpansion: g.isExpansion || expansionIds.has(g.bggId) }));
  const snapshot = { username: USERNAME, source: "BoardGameGeek XML API2",
    syncedAt: new Date(now).toISOString(), count: games.length, games };
  await store.put("WISHLIST", snapshot);
  return snapshot;
}

async function getTaskResults(task) {
  const run = await data("/actor-tasks/" + encodeURIComponent(task.taskId) +
    "/runs/last?status=SUCCEEDED");
  if (!run?.id || !run.defaultDatasetId ||
      !Number.isFinite(Date.parse(run.finishedAt || "")) ||
      Date.now() - Date.parse(run.finishedAt) > 7 * 3600_000) {
    throw new Error("Saved Apify task " + task.taskId + " has no recent successful run");
  }
  const resp = await rawApify("/datasets/" + encodeURIComponent(run.defaultDatasetId) +
    "/items?clean=true&limit=150");
  const results = await resp.json();
  if (!Array.isArray(results)) throw new Error("Task dataset shape unsupported");
  return { task, runId: run.id, results: results.map(normalizeActorListing).filter(Boolean) };
}

async function scrape(query) {
  const input = {
    searchKeyword: query.searchKeyword,
    location: "Austin, Texas, United States",
    radiusKm: 32,
    sortBy: "creation_time_descend",
    daysSinceListed: query.priority <= 2 ? "1" : query.priority === 5 ? "30" : "7",
    getListingDetails: false,
    getAllListingPhotos: false,
    strictFiltering: true,
    maxPagesPerUrl: 1,
    onlyNewListings: false,
    proxy: PROXY
  };
  const created = await data("/acts/Y0QGH7cuqgKtNbEgt/runs?maxTotalChargeUsd=0.03",
    { method: "POST", body: input });
  if (!created?.id) throw new Error("Marketplace Actor returned no run ID");
  let run = created;
  const terminal = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
  for (let i = 0; i < 36 && !terminal.has(run.status); i++) {
    await sleep(5000);
    run = await data("/actor-runs/" + encodeURIComponent(created.id));
  }
  if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
    throw new Error("Marketplace Actor did not complete successfully: " + run.status);
  }
  const resp = await rawApify("/datasets/" + encodeURIComponent(run.defaultDatasetId) +
    "/items?clean=true&limit=150");
  const results = await resp.json();
  if (!Array.isArray(results)) throw new Error("Marketplace dataset shape unsupported");
  return { query, runId: created.id,
    results: results.map(normalizeActorListing).filter(Boolean) };
}

async function mapBounded(values, limit, work) {
  const out = new Array(values.length);
  let at = 0;
  async function worker() {
    for (;;) {
      const i = at++;
      if (i >= values.length) return;
      try { out[i] = await work(values[i]); }
      catch (error) {
        // Do not accidentally print external source content.
        out[i] = { error: String(error?.message || error).slice(0,150), results: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return out;
}

async function resend(payload, key) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + requireSecret("RESEND_API_KEY"),
      "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("Resend rejected message: HTTP " + response.status);
  const confirmed = await response.json();
  if (!confirmed?.id) throw new Error("Resend did not confirm message acceptance");
  return confirmed.id;
}

async function deliver(store, now) {
  let outbox = await store.get("OUTBOX", emptyOutbox());
  if (!outbox.activeBatch) {
    outbox = prepareBatch(outbox, new Date(now).toISOString());
    if (outbox.activeBatch) await store.put("OUTBOX", outbox);
  }
  const batch = outbox.activeBatch;
  if (!batch) return { emails: 0, listings: 0 };
  const age = now - Date.parse(batch.preparedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > MAX_EMAIL_RETRY_MS) {
    throw new Error("Uncertain old email batch requires reconciliation; refusing unsafe retry");
  }
  const recipient = requireSecret("MARKETPLACE_ALERT_TO");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("MARKETPLACE_ALERT_TO must contain exactly one valid email address");
  }
  const from = "Marketplace Alerts <alerts@planitnow.us>";
  const payload = renderEmail(batch, recipient, from);
  await resend(payload, "bgg-marketplace-apify-v1-" + batch.id);
  const time = new Date(now).toISOString();
  const receipts = await store.get("EMAIL_RECEIPTS",
    { version: 1, listingPrices: {}, lastSentAt: null });
  receipts.listingPrices ||= {};
  for (const item of batch.items) {
    receipts.listingPrices[item.key] = { price: item.price, sentAt: time };
  }
  receipts.lastSentAt = time;
  receipts.lastBatchSize = batch.items.length;
  await store.put("EMAIL_RECEIPTS", receipts);
  await store.put("OUTBOX", acknowledgeBatch(outbox, time));
  console.log("Marketplace Resend alert accepted, matches:", batch.items.length);
  return { emails: 1, listings: batch.items.length };
}

function pruneSeen(ids, now) {
  const cutoff = now - 60 * 86400000;
  for (const [key, value] of Object.entries(ids)) {
    if (!Number.isFinite(Date.parse(value.seenAt || "")) ||
        Date.parse(value.seenAt) < cutoff) delete ids[key];
  }
  return ids;
}

async function runScan(store) {
  const now = Date.now();
  const wishlist = await currentWishlist(store, now);
  if (now - Date.parse(wishlist.syncedAt) > 48 * 3600_000) {
    throw new Error("BGG snapshot stale; scan withheld");
  }
  const slot = Math.floor(now / (4 * 3600_000));
  const planned = selectQueries(wishlist.games, slot, 12);
  const covered = new Set(TASKS.filter((t) => typeof t.bggId === "number").map((t) => t.bggId));
  const newPriority1 = wishlist.games.filter((g) => g.priority === 1 &&
    !covered.has(g.bggId)).map((g) => ({
      searchKeyword: g.name, gameId: g.bggId, priority: 1
    }));
  const queries = [...newPriority1, ...planned.filter((q) => q.priority >= 2 && q.priority <= 5)]
    .slice(0, 12);
  const activeTasks = TASKS.filter((t) => t.bggId === "xbox" ||
    wishlist.games.some((g) => g.bggId === t.bggId && g.priority === 1));
  const [scans, saved] = await Promise.all([
    mapBounded(queries, 2, scrape),
    mapBounded(activeTasks, 2, getTaskResults)
  ]);
  const completeScans = scans.filter((x) => !x.error);
  const completeTasks = saved.filter((x) => !x.error);
  if (!completeScans.length && !completeTasks.length) {
    throw new Error("All Marketplace searches and saved tasks failed");
  }
  const gameListings = [
    ...completeScans.flatMap((x) => x.results),
    ...completeTasks.filter((x) => x.task.bggId !== "xbox").flatMap((x) => x.results)
  ];
  const xboxListings = completeTasks.filter((x) => x.task.bggId === "xbox")
    .flatMap((x) => x.results);
  const matches = [...matchWishlist(wishlist.games, gameListings),
    ...xboxMatches(xboxListings)];
  const seen = await store.get("SEEN", { ids: {}, updatedAt: null });
  const first = !seen.updatedAt;
  const before = seen.ids || {};
  const fresh = first ? [] : matches.filter((m) =>
    before[m.listingId + ":" + m.bggId]?.price !== m.price);
  const updatedAt = new Date(now).toISOString();
  for (const item of matches) {
    before[item.listingId + ":" + item.bggId] = { price: item.price, seenAt: updatedAt };
  }
  // Save queued alerts BEFORE committing the seen-state cursor.
  const pending = await store.get("OUTBOX", emptyOutbox());
  await store.put("OUTBOX", enqueueAlerts(pending, fresh, updatedAt));
  await store.put("SEEN", { updatedAt, ids: pruneSeen(before, now) });
  const failures = [...scans, ...saved].filter((x) => x.error).map((x) => x.error);
  const report = {
    checkedAt: updatedAt, wishlistCount: wishlist.games.length,
    wishlistSyncedAt: wishlist.syncedAt, queriesAttempted: queries.length,
    queriesCompleted: completeScans.length, savedTasksChecked: activeTasks.length,
    savedTasksCompleted: completeTasks.length,
    fetchedListings: gameListings.length + xboxListings.length,
    matchedListings: matches.length, freshMatches: fresh.length,
    firstRunBaseline: first, errors: failures
  };
  await store.put("LAST_SCAN", report);
  const email = await deliver(store, now);
  await store.put("HEALTH", { ...report, completedAt: new Date().toISOString(),
    status: failures.length ? "partial_success" : "healthy",
    emailsAccepted: email.emails, emailedListings: email.listings });
  console.log("Marketplace monitor:", JSON.stringify({
    ...report, emailsAccepted: email.emails, emailedListings: email.listings
  }));
}

async function watchdog(store) {
  const now = Date.now();
  const last = await store.get("HEALTH");
  const age = now - Date.parse(last?.completedAt || "");
  // The watchdog runs hourly; tolerate one delayed tick before alerting.
  if (Number.isFinite(age) && age >= 0 && age < 6 * 3600_000) {
    console.log("Marketplace scan heartbeat healthy, minutes old:", Math.floor(age / 60_000));
    return;
  }
  const previous = await store.get("WATCHDOG");
  if (Number.isFinite(Date.parse(previous?.sentAt || "")) &&
      now - Date.parse(previous.sentAt) < 12 * 3600_000) return;
  const when = new Date(now).toISOString();
  const email = {
    from: "Marketplace Alerts <alerts@planitnow.us>",
    to: [requireSecret("MARKETPLACE_ALERT_TO")],
    subject: "Marketplace monitor: scan is overdue",
    text: "The managed Marketplace monitor has not completed a full scan in over six hours. Check the Apify schedule and actor run log. No listing matches are implied by this health alert."
  };
  await resend(email, "bgg-marketplace-watchdog-" + Math.floor(now / (12 * 3600_000)));
  await store.put("WATCHDOG", { sentAt: when, reason: "scan_overdue" });
  console.warn("Marketplace scan was overdue; failure email accepted by Resend");
}

async function main() {
  const inputId = process.env.ACTOR_DEFAULT_KEY_VALUE_STORE_ID;
  let input = { mode: "scan" };
  if (inputId) {
    const response = await rawApify("/key-value-stores/" +
      encodeURIComponent(inputId) + "/records/INPUT", { allow404: true });
    if (response) input = await response.json();
  }
  const mode = input?.mode || "scan";
  if (!["scan", "watchdog", "check"].includes(mode)) {
    throw new Error("Unsupported monitor mode");
  }
  const store = await openState();
  if (mode === "check") {
    // Safe preflight: validates secret availability, store access, and task
    // metadata but never executes scrapers or sends email.
    requireSecret("BGG_API_TOKEN");
    requireSecret("RESEND_API_KEY");
    requireSecret("MARKETPLACE_ALERT_TO");
    const task = await getTaskResults(TASKS[0]);
    console.log("Safe preflight succeeded; saved task run:", task.runId);
    return;
  }
  if (mode === "watchdog") return watchdog(store);
  return runScan(store);
}
main().catch((error) => {
  // No secret or email address is printed in errors.
  console.error("BGG_MARKETPLACE_ACTOR_ERROR:", String(error?.message || error).slice(0,300));
  process.exitCode = 1;
});
