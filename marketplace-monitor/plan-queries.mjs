// Export each four-hour slot's search plan for the connected ChatGPT/Apify MCP
// automation. This requires NO Apify API token in GitHub Actions.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { selectQueries } from "./monitor.mjs";

const wishlistPath = new URL("./data/wishlist.json", import.meta.url);
const exportPath = new URL("./data/queries.json", import.meta.url);
export async function exportQueryPlan({ now = Date.now() } = {}) {
  const wishlist = JSON.parse(await readFile(wishlistPath, "utf8"));
  if (!Array.isArray(wishlist.games) || wishlist.games.length < 10)
    throw new Error("Wishlist unavailable; refusing to create a misleading query plan");
  const slot = Math.floor(now / (4 * 60 * 60 * 1000));
  const cap = Math.max(2, Math.min(24, Number(process.env.MAX_QUERIES_PER_RUN || 12)));
  const queries = selectQueries(wishlist.games, slot, cap);
  const plan = {
    generatedAt: new Date(now).toISOString(),
    wishlistSyncedAt: wishlist.syncedAt,
    wishlistCount: wishlist.games.length,
    slot,
    queries
  };
  await mkdir(dirname(fileURLToPath(exportPath)), { recursive: true });
  await writeFile(exportPath, JSON.stringify(plan, null, 2) + "\n");
  console.log("Published", queries.length, "Marketplace queries from",
    wishlist.games.length, "BGG wishlist games");
  return plan;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  exportQueryPlan().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
