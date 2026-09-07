import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { hash } from "./auth";
import { BggClient, type BggCollectionItem, type BggThing } from "./bgg";

type Bindings = { DB: D1Database; BGG_API_TOKEN: string };
type User = { id: string; email: string; role: string };
type Variables = { user: User };
type SourceAccount = {
  id: string;
  username: string;
  lastCollectionSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastRequestAt: string | null;
  lastError: string | null;
};
type SyncRun = {
  id: string;
  status: string;
  totalItems: number;
  enrichedItems: number;
  failedItems: number;
  requestAttempts: number;
  retryAttempts: number;
  failedRequests: number;
  omittedItems: number;
  createdAt: string;
  completedAt: string | null;
  lastError: string | null;
};
const MIN_BGG_INTERVAL_MS = 5000,
  FRESH_DAYS = 30,
  // Give up on a run after this many failed BGG requests so a permanently
  // unreachable API cannot keep the background sweep retrying forever.
  MAX_FAILED_REQUESTS = 12,
  // Wall-clock budget for one scheduled sweep. Kept under the one-minute cron
  // interval so consecutive ticks do not overlap.
  BACKGROUND_BUDGET_MS = 45_000;
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>();

api.use("*", async (c, next) => {
  const token = getCookie(c, "bge_session");
  if (!token) return c.json({ error: "Authentication required" }, 401);
  const user = await c.env.DB.prepare(
    "SELECT users.id,users.email,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND users.disabled_at IS NULL"
  )
    .bind(await hash(token))
    .first<User>();
  if (!user) return c.json({ error: "Authentication required" }, 401);
  c.set("user", user);
  await next();
});
api.get("/account", async (c) => {
  const user = c.get("user"),
    account = await getAccount(c.env.DB, user.id);
  if (!account) return c.json({ account: null, latestRun: null });
  return c.json({ account, latestRun: withDuration(await latestRun(c.env.DB, user.id)) });
});
api.post("/account", async (c) => {
  const user = c.get("user"),
    body = await c.req.json<{ username?: string }>(),
    username = normalizeUsername(body.username);
  if (!username) return c.json({ error: "A valid BoardGameGeek username is required" }, 400);
  const id = `bgg-self:${user.id}`,
    now = new Date().toISOString();
  await c.env.DB.prepare(
    'INSERT INTO source_accounts(id,user_id,provider,username,updated_at)VALUES(?,?,"bgg",?,?) ON CONFLICT(user_id,provider) DO UPDATE SET username=excluded.username,updated_at=excluded.updated_at,last_error=NULL'
  )
    .bind(id, user.id, username, now)
    .run();
  return c.json({ account: await getAccount(c.env.DB, user.id) });
});

api.post("/sync/start", async (c) => {
  const user = c.get("user"),
    body = await safeJson<{ username?: string }>(c);
  let account = await getAccount(c.env.DB, user.id);
  const supplied = normalizeUsername(body.username);
  if (supplied && (!account || account.username.toLowerCase() !== supplied.toLowerCase())) {
    const id = `bgg-self:${user.id}`,
      now = new Date().toISOString();
    await c.env.DB.prepare(
      'INSERT INTO source_accounts(id,user_id,provider,username,updated_at)VALUES(?,?,"bgg",?,?) ON CONFLICT(user_id,provider) DO UPDATE SET username=excluded.username,updated_at=excluded.updated_at,last_error=NULL'
    )
      .bind(id, user.id, supplied, now)
      .run();
    account = await getAccount(c.env.DB, user.id);
  }
  if (!account) return c.json({ error: "Connect a BoardGameGeek username before syncing" }, 400);
  const active = await activeRun(c.env.DB, user.id);
  if (active) return c.json({ error: "A sync is already running", run: withDuration(active) }, 409);
  const retryAfterMs = await claimBggSlot(c.env.DB, account.id, account.lastRequestAt);
  if (retryAfterMs > 0)
    return c.json(
      { error: "BoardGameGeek requests are paced to protect the API", retryAfterMs },
      429
    );
  let attempts = 0,
    retries = 0,
    items: BggCollectionItem[];
  try {
    items = await new BggClient(c.env.BGG_API_TOKEN, {
      onAttempt: (_status, attempt) => {
        attempts++;
        if (attempt > 1) retries++;
      }
    }).collection(account.username, { own: 1, excludesubtype: "boardgameexpansion" });
  } catch (error) {
    const message = publicError(error);
    await c.env.DB.prepare("UPDATE source_accounts SET last_error=?,updated_at=? WHERE id=?")
      .bind(message, new Date().toISOString(), account.id)
      .run();
    return c.json({ error: message }, 502);
  }
  if (!items.length) {
    const message = `BoardGameGeek returned no owned base games for @${account.username}. Check the username and public collection before syncing.`;
    await c.env.DB.prepare("UPDATE source_accounts SET last_error=?,updated_at=? WHERE id=?")
      .bind(message, new Date().toISOString(), account.id)
      .run();
    return c.json({ error: message }, 422);
  }
  const runId = crypto.randomUUID(),
    now = new Date().toISOString(),
    cutoff = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString(),
    freshRows = await c.env.DB.prepare(
      "SELECT id FROM games WHERE bgg_fetched_at IS NOT NULL AND bgg_fetched_at>=?"
    )
      .bind(cutoff)
      .all<{ id: number }>(),
    fresh = new Set(freshRows.results.map((row) => Number(row.id))),
    initiallyDone = items.filter((item) => fresh.has(item.id)).length;
  await c.env.DB.prepare(
    "INSERT INTO bgg_sync_runs(id,user_id,source_account_id,total_items,enriched_items,request_attempts,retry_attempts)VALUES(?,?,?,?,?,?,?)"
  )
    .bind(runId, user.id, account.id, items.length, initiallyDone, attempts, retries)
    .run();
  for (const group of chunks(items, 25)) {
    const statements: D1PreparedStatement[] = [];
    for (const item of group) {
      const collectionId = collectionItemId(user.id, item);
      statements.push(
        c.env.DB.prepare("INSERT INTO games(id,name)VALUES(?,?) ON CONFLICT(id) DO NOTHING").bind(
          item.id,
          item.name
        )
      );
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO collection_items(id,user_id,bgg_id,source_coll_id,own,for_trade,wishlist,wishlist_priority,rating,source_name,source_account_id,source_synced_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bgg_id=excluded.bgg_id,source_coll_id=excluded.source_coll_id,own=excluded.own,for_trade=excluded.for_trade,wishlist=excluded.wishlist,wishlist_priority=excluded.wishlist_priority,rating=COALESCE(excluded.rating,collection_items.rating),source_name=excluded.source_name,source_account_id=excluded.source_account_id,source_synced_at=excluded.source_synced_at"
        ).bind(
          collectionId,
          user.id,
          item.id,
          item.collId,
          item.own ? 1 : 0,
          item.forTrade ? 1 : 0,
          item.wishlist ? 1 : 0,
          item.wishlistPriority,
          item.rating,
          item.name,
          account.id,
          now
        )
      );
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO bgg_sync_items(run_id,bgg_id,collection_item_id,status)VALUES(?,?,?,?)"
        ).bind(runId, item.id, collectionId, fresh.has(item.id) ? "done" : "pending")
      );
    }
    if (statements.length) await c.env.DB.batch(statements);
  }
  await c.env.DB.prepare(
    "UPDATE collection_items SET own=0,source_synced_at=? WHERE user_id=? AND source_account_id=? AND own=1 AND NOT EXISTS(SELECT 1 FROM bgg_sync_items si WHERE si.run_id=? AND si.collection_item_id=collection_items.id)"
  )
    .bind(now, user.id, account.id, runId)
    .run();
  const complete = initiallyDone === items.length;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE source_accounts SET last_collection_sync_at=?,last_full_sync_at=CASE WHEN ? THEN ? ELSE last_full_sync_at END,last_error=NULL,updated_at=? WHERE id=?"
    ).bind(now, complete ? 1 : 0, now, now, account.id),
    c.env.DB.prepare(
      "UPDATE bgg_sync_runs SET status=CASE WHEN ? THEN 'complete' ELSE 'running' END,completed_at=CASE WHEN ? THEN ? ELSE NULL END WHERE id=?"
    ).bind(complete ? 1 : 0, complete ? 1 : 0, now, runId)
  ]);
  return c.json({
    run: withDuration(await runStatus(c.env.DB, user.id, runId)),
    nextRequestAfterMs: complete ? 0 : MIN_BGG_INTERVAL_MS
  });
});

api.post("/sync/:id/enrich", async (c) => {
  const user = c.get("user");
  const result = await enrichStep(c.env.DB, c.env.BGG_API_TOKEN, user.id, c.req.param("id"));
  if (result.outcome === "not-found") return c.json({ error: "Sync run not found" }, 404);
  if (result.outcome === "paced")
    return c.json(
      {
        error: "BoardGameGeek requests are paced to protect the API",
        retryAfterMs: result.retryAfterMs
      },
      429
    );
  if (result.outcome === "bgg-error") return c.json({ error: result.error }, 502);
  return c.json({ run: withDuration(result.run), nextRequestAfterMs: result.nextRequestAfterMs });
});

api.get("/sync/:id", async (c) => {
  const user = c.get("user"),
    run = await runStatus(c.env.DB, user.id, c.req.param("id"));
  return run ? c.json({ run: withDuration(run) }) : c.json({ error: "Sync run not found" }, 404);
});
api.get("/telemetry", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Administrator access required" }, 403);
  const runs = await c.env.DB.prepare(
    "SELECT id,status,total_items totalItems,enriched_items enrichedItems,failed_items failedItems,request_attempts requestAttempts,retry_attempts retryAttempts,failed_requests failedRequests,omitted_items omittedItems,created_at createdAt,completed_at completedAt,last_error lastError FROM bgg_sync_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 20"
  )
    .bind(user.id)
    .all<SyncRun>();
  const output = [];
  for (const run of runs.results) {
    const failures = await c.env.DB.prepare(
      "SELECT COALESCE(error,'unknown') category,COUNT(*) count FROM bgg_sync_items WHERE run_id=? AND status='failed' GROUP BY COALESCE(error,'unknown')"
    )
      .bind(run.id)
      .all<{ category: string; count: number }>();
    output.push({
      ...withDuration(run),
      failureCategories: failures.results.map((x) => ({
        category: sanitizeFailureCategory(x.category),
        count: Number(x.count)
      }))
    });
  }
  return c.json(output);
});

export default api;

export type EnrichOutcome =
  | { outcome: "not-found" }
  | { outcome: "paced"; retryAfterMs: number }
  | { outcome: "bgg-error"; error: string }
  | { outcome: "progressed"; run: SyncRun | null; nextRequestAfterMs: number };

/**
 * Advance one sync run by a single BoardGameGeek Thing batch (at most 20 IDs).
 *
 * This is deliberately free of any request context so that both the browser-driven
 * `/sync/:id/enrich` route and the scheduled background sweep can drive the same
 * state machine. Callers are responsible for deciding when to come back.
 */
export async function enrichStep(
  db: D1Database,
  bggToken: string,
  userId: string,
  runId: string
): Promise<EnrichOutcome> {
  const run = await db
    .prepare(
      "SELECT r.id,r.status,r.failed_requests failedRequests,r.source_account_id sourceAccountId,sa.last_request_at lastRequestAt FROM bgg_sync_runs r JOIN source_accounts sa ON sa.id=r.source_account_id WHERE r.id=? AND r.user_id=?"
    )
    .bind(runId, userId)
    .first<{
      id: string;
      status: string;
      failedRequests: number;
      sourceAccountId: string;
      lastRequestAt: string | null;
    }>();
  if (!run) return { outcome: "not-found" };
  if (run.status !== "running")
    return {
      outcome: "progressed",
      run: await runStatus(db, userId, runId),
      nextRequestAfterMs: 0
    };
  const pending = await db
    .prepare(
      "SELECT bgg_id bggId FROM bgg_sync_items WHERE run_id=? AND status='pending' ORDER BY bgg_id LIMIT 20"
    )
    .bind(runId)
    .all<{ bggId: number }>();
  if (!pending.results.length)
    return {
      outcome: "progressed",
      run: await finalizeRun(db, userId, runId, run.sourceAccountId),
      nextRequestAfterMs: 0
    };
  const retryAfterMs = await claimBggSlot(db, run.sourceAccountId, run.lastRequestAt);
  if (retryAfterMs > 0) return { outcome: "paced", retryAfterMs };
  const ids = pending.results.map((row) => Number(row.bggId));
  let attempts = 0,
    retries = 0,
    things: BggThing[];
  try {
    things = await new BggClient(bggToken, {
      onAttempt: (_status, attempt) => {
        attempts++;
        if (attempt > 1) retries++;
      }
    }).things(ids);
  } catch (error) {
    const message = publicError(error);
    await db.batch([
      db
        .prepare(
          "UPDATE bgg_sync_runs SET last_error=?,request_attempts=request_attempts+?,retry_attempts=retry_attempts+?,failed_requests=failed_requests+1 WHERE id=? AND user_id=?"
        )
        .bind(message, attempts, retries, runId, userId),
      db
        .prepare("UPDATE source_accounts SET last_error=?,updated_at=? WHERE id=?")
        .bind(message, new Date().toISOString(), run.sourceAccountId)
    ]);
    // A run that can never reach BGG would otherwise be retried by every cron tick
    // forever. Give up once, keeping whatever did enrich, rather than hammering.
    if (Number(run.failedRequests) + 1 >= MAX_FAILED_REQUESTS)
      await abandonRun(db, userId, runId, run.sourceAccountId);
    return { outcome: "bgg-error", error: message };
  }
  const byId = new Map(things.map((thing) => [thing.id, thing])),
    fetchedAt = new Date().toISOString(),
    statements: D1PreparedStatement[] = [],
    omitted = ids.filter((id) => !byId.has(id)).length;
  statements.push(
    db
      .prepare(
        "UPDATE bgg_sync_runs SET request_attempts=request_attempts+?,retry_attempts=retry_attempts+?,omitted_items=omitted_items+? WHERE id=? AND user_id=?"
      )
      .bind(attempts, retries, omitted, runId, userId)
  );
  for (const id of ids) {
    const thing = byId.get(id);
    if (!thing) {
      statements.push(
        db
          .prepare(
            "UPDATE bgg_sync_items SET status='failed',error='Thing response omitted this ID' WHERE run_id=? AND bgg_id=?"
          )
          .bind(runId, id)
      );
      continue;
    }
    statements.push(
      db
        .prepare(
          "UPDATE games SET name=?,year=?,min_players=?,max_players=?,play_time=?,weight=?,image_url=?,thumbnail_url=?,bgg_type=?,bgg_fetched_at=? WHERE id=?"
        )
        .bind(
          thing.name,
          thing.year,
          thing.minPlayers || null,
          thing.maxPlayers || null,
          thing.minutes || null,
          thing.weight,
          thing.image,
          thing.thumbnail,
          thing.type,
          fetchedAt,
          id
        )
    );
    statements.push(db.prepare("DELETE FROM game_polls WHERE bgg_id=?").bind(id));
    for (const [playerCount, votes] of Object.entries(thing.polls))
      statements.push(
        db
          .prepare(
            "INSERT INTO game_polls(bgg_id,player_count,best_votes,recommended_votes,not_recommended_votes,fetched_at)VALUES(?,?,?,?,?,?)"
          )
          .bind(id, playerCount, votes.best, votes.recommended, votes.notRecommended, fetchedAt)
      );
    statements.push(db.prepare("DELETE FROM game_tags WHERE bgg_id=?").bind(id));
    for (const tag of thing.categories)
      statements.push(
        db
          .prepare('INSERT INTO game_tags(bgg_id,kind,bgg_tag_id,name)VALUES(?,"category",?,?)')
          .bind(id, tag.id, tag.name)
      );
    for (const tag of thing.mechanics)
      statements.push(
        db
          .prepare('INSERT INTO game_tags(bgg_id,kind,bgg_tag_id,name)VALUES(?,"mechanic",?,?)')
          .bind(id, tag.id, tag.name)
      );
    statements.push(
      db
        .prepare("UPDATE bgg_sync_items SET status='done',error=NULL WHERE run_id=? AND bgg_id=?")
        .bind(runId, id)
    );
  }
  for (const group of chunks(statements, 80)) if (group.length) await db.batch(group);
  const status = await refreshRun(db, userId, runId, run.sourceAccountId);
  return {
    outcome: "progressed",
    run: status,
    nextRequestAfterMs: status?.status === "running" ? MIN_BGG_INTERVAL_MS : 0
  };
}

export type BackgroundSyncOptions = {
  budgetMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  /** Injected by tests so the sweep loop can be exercised without D1 or BGG. */
  step?: (userId: string, runId: string) => Promise<EnrichOutcome>;
};

/**
 * Drive every sync run that is still `running` forward, without a browser.
 *
 * Called from the Worker's scheduled handler so that closing the tab mid-sync no
 * longer strands a run. Steps are spaced by MIN_BGG_INTERVAL_MS globally (not just
 * per account) so that concurrent users cannot combine into a burst against BGG.
 */
export async function runBackgroundSync(
  db: D1Database,
  bggToken: string,
  options: BackgroundSyncOptions = {}
): Promise<{ runs: number; steps: number; completed: number }> {
  const budgetMs = options.budgetMs ?? BACKGROUND_BUDGET_MS,
    now = options.now ?? (() => Date.now()),
    wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    step =
      options.step ?? ((userId: string, runId: string) => enrichStep(db, bggToken, userId, runId));
  const deadline = now() + budgetMs;
  const rows = await db
    .prepare(
      "SELECT id,user_id userId FROM bgg_sync_runs WHERE status='running' ORDER BY created_at LIMIT 25"
    )
    .all<{ id: string; userId: string }>();
  const queue = rows.results.map((row) => ({ id: row.id, userId: row.userId, paced: 0 }));
  let steps = 0,
    completed = 0;
  while (queue.length && now() + MIN_BGG_INTERVAL_MS <= deadline) {
    const run = queue.shift()!;
    const result = await step(run.userId, run.id);
    steps++;
    if (result.outcome === "paced") {
      // Something else — almost certainly an open browser tab — is already driving
      // this account. Yield to it rather than competing for the same slot.
      if (++run.paced < 2) queue.push(run);
    } else if (result.outcome === "progressed") {
      if (result.run?.status === "running") queue.push(run);
      else completed++;
    }
    // A "bgg-error" or "not-found" run is left for the next tick.
    await wait(MIN_BGG_INTERVAL_MS);
  }
  return { runs: rows.results.length, steps, completed };
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (!username || username.length > 100 || /[<>\u0000-\u001f\u007f]/.test(username)) return null;
  return username;
}
export function collectionItemId(
  userId: string,
  item: Pick<BggCollectionItem, "id" | "collId">
): string {
  return `${userId}:${item.collId || item.id}`;
}
const RUN_SELECT =
  "id,status,total_items totalItems,enriched_items enrichedItems,failed_items failedItems,request_attempts requestAttempts,retry_attempts retryAttempts,failed_requests failedRequests,omitted_items omittedItems,created_at createdAt,completed_at completedAt,last_error lastError";
async function getAccount(db: D1Database, userId: string): Promise<SourceAccount | null> {
  return db
    .prepare(
      "SELECT id,username,last_collection_sync_at lastCollectionSyncAt,last_full_sync_at lastFullSyncAt,last_request_at lastRequestAt,last_error lastError FROM source_accounts WHERE user_id=? AND provider='bgg'"
    )
    .bind(userId)
    .first<SourceAccount>();
}
async function latestRun(db: D1Database, userId: string): Promise<SyncRun | null> {
  return db
    .prepare(
      `SELECT ${RUN_SELECT} FROM bgg_sync_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(userId)
    .first<SyncRun>();
}
async function activeRun(db: D1Database, userId: string): Promise<SyncRun | null> {
  return db
    .prepare(
      `SELECT ${RUN_SELECT} FROM bgg_sync_runs WHERE user_id=? AND status='running' ORDER BY created_at DESC LIMIT 1`
    )
    .bind(userId)
    .first<SyncRun>();
}
async function runStatus(db: D1Database, userId: string, runId: string): Promise<SyncRun | null> {
  return db
    .prepare(`SELECT ${RUN_SELECT} FROM bgg_sync_runs WHERE id=? AND user_id=?`)
    .bind(runId, userId)
    .first<SyncRun>();
}
function withDuration(run: SyncRun | null) {
  if (!run) return null;
  const start = Date.parse(run.createdAt),
    end = run.completedAt ? Date.parse(run.completedAt) : Date.now();
  return {
    ...run,
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null
  };
}
async function claimBggSlot(
  db: D1Database,
  accountId: string,
  lastRequestAt: string | null
): Promise<number> {
  if (lastRequestAt) {
    const elapsed = Date.now() - Date.parse(lastRequestAt);
    if (Number.isFinite(elapsed) && elapsed < MIN_BGG_INTERVAL_MS)
      return MIN_BGG_INTERVAL_MS - elapsed;
  }
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE source_accounts SET last_request_at=?,updated_at=? WHERE id=?")
    .bind(now, now, accountId)
    .run();
  return 0;
}
async function refreshRun(
  db: D1Database,
  userId: string,
  runId: string,
  sourceAccountId: string
): Promise<SyncRun | null> {
  const counts = await db
      .prepare(
        "SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending FROM bgg_sync_items WHERE run_id=?"
      )
      .bind(runId)
      .first<{ done: number | null; failed: number | null; pending: number | null }>(),
    done = Number(counts?.done ?? 0),
    failed = Number(counts?.failed ?? 0),
    pending = Number(counts?.pending ?? 0),
    now = new Date().toISOString(),
    status = pending > 0 ? "running" : failed > 0 ? "partial" : "complete";
  await db
    .prepare(
      "UPDATE bgg_sync_runs SET status=?,enriched_items=?,failed_items=?,last_error=CASE WHEN ?='complete' THEN NULL ELSE last_error END,completed_at=CASE WHEN ?='running' THEN NULL ELSE ? END WHERE id=? AND user_id=?"
    )
    .bind(status, done, failed, status, status, now, runId, userId)
    .run();
  if (status !== "running")
    await db
      .prepare(
        "UPDATE source_accounts SET last_full_sync_at=CASE WHEN ?='complete' THEN ? ELSE last_full_sync_at END,last_error=CASE WHEN ?='complete' THEN NULL ELSE last_error END,updated_at=? WHERE id=?"
      )
      .bind(status, now, status, now, sourceAccountId)
      .run();
  return runStatus(db, userId, runId);
}
/**
 * Stop retrying a run that keeps failing against BGG, keeping everything that did
 * enrich. Remaining pending items are marked failed so refreshRun can settle the
 * run as 'partial' instead of leaving it 'running' forever.
 */
async function abandonRun(
  db: D1Database,
  userId: string,
  runId: string,
  sourceAccountId: string
): Promise<SyncRun | null> {
  await db
    .prepare(
      "UPDATE bgg_sync_items SET status='failed',error='Abandoned after repeated BoardGameGeek request failures' WHERE run_id=? AND status='pending'"
    )
    .bind(runId)
    .run();
  return refreshRun(db, userId, runId, sourceAccountId);
}
async function finalizeRun(
  db: D1Database,
  userId: string,
  runId: string,
  sourceAccountId: string
): Promise<SyncRun | null> {
  return refreshRun(db, userId, runId, sourceAccountId);
}
async function safeJson<T>(c: { req: { json: () => Promise<T> } }): Promise<Partial<T>> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}
function publicError(error: unknown): string {
  return error instanceof Error ? error.message : "BoardGameGeek request failed";
}
function sanitizeFailureCategory(value: string) {
  if (value.includes("omitted")) return "thing_omitted_id";
  if (value.toLowerCase().includes("http")) return "bgg_http_error";
  return "sync_item_failure";
}
function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
