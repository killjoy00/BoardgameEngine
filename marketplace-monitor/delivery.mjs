// Transactional email outbox for Marketplace notifications.
// Never stores recipients, credentials or email content in the public repository.
// Prepare/commit the frozen batch before sending; retries reuse Resend's
// Idempotency-Key (24h retention). Uncertain older batches fail closed.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dataPath = new URL("./data/pending-email.json", import.meta.url);
const receiptPath = new URL("./data/email-notified.json", import.meta.url);
const MAX_BATCH_ITEMS = 30;
const MAX_RETRY_AGE_MS = 20 * 60 * 60 * 1000;

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
async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}
async function saveJson(url, data) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, JSON.stringify(data, null, 2) + "\n");
}
export async function prepare() {
  const before = await readJson(dataPath, emptyOutbox());
  const after = prepareBatch(before, new Date().toISOString());
  if (JSON.stringify(before) !== JSON.stringify(after)) await saveJson(dataPath, after);
  console.log("Prepared email batch:", after.activeBatch?.items.length || 0, "items");
  return after.activeBatch;
}
export async function send({ fetcher = fetch, now = Date.now() } = {}) {
  const outbox = await readJson(dataPath, emptyOutbox());
  const batch = outbox.activeBatch;
  if (!batch) { console.log("No pending Marketplace email; no email sent"); return null; }
  if (!Number.isFinite(Date.parse(batch.preparedAt)) ||
      now - Date.parse(batch.preparedAt) > MAX_RETRY_AGE_MS) {
    throw new Error("Unconfirmed email batch is too old for safe idempotent retry; manual delivery reconciliation required");
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.MARKETPLACE_ALERT_TO;
  const from = process.env.MARKETPLACE_ALERT_FROM || "Marketplace Alerts <alerts@planitnow.us>";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("MARKETPLACE_ALERT_TO secret must be one valid recipient email");
  }
  if (!/^[^<\n]+<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(from)) {
    throw new Error("MARKETPLACE_ALERT_FROM must be a verified sender");
  }
  const payload = renderEmail(batch, to, from);
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": "marketplace-v1-" + batch.id
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    // Do not expose API response bodies (which might echo recipients or credentials).
    throw new Error("Resend rejected Marketplace email (HTTP " + response.status + ")");
  }
  const confirmation = await response.json();
  if (typeof confirmation.id !== "string" || !confirmation.id) {
    throw new Error("Resend did not confirm message acceptance");
  }
  const sentAt = new Date(now).toISOString();
  const receipts = await readJson(receiptPath,
    { version: 1, startedAt: sentAt.slice(0, 10), processedRuns: {}, listingPrices: {} });
  receipts.listingPrices ||= {};
  for (const item of batch.items) {
    receipts.listingPrices[item.key] = { price: item.price, sentAt };
  }
  receipts.lastCheckedAt = sentAt;
  receipts.lastSentAt = sentAt;
  receipts.lastBatchSize = batch.items.length;
  await saveJson(receiptPath, receipts);
  await saveJson(dataPath, acknowledgeBatch(outbox, sentAt));
  console.log("Resend accepted Marketplace alert batch:", batch.items.length, "items");
  return { count: batch.items.length, accepted: true };
}
const command = process.argv[2];
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const op = command === "prepare" ? prepare : command === "send" ? send : null;
  if (!op) {
    console.error("Usage: node delivery.mjs prepare|send");
    process.exitCode = 2;
  } else {
    op().catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
