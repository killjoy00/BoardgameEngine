import { describe, it, expect } from "vitest";
import {
  claimBggSlot,
  collectionItemId,
  normalizeUsername,
  runBackgroundSync,
  type EnrichOutcome
} from "../src/bgg-api";

/** Minimal D1 stand-in: the sweep only queries for runs that are still in flight. */
function dbWithRunningRuns(rows: { id: string; userId: string }[]) {
  return {
    prepare: () => ({ all: async () => ({ results: rows }) })
  } as unknown as D1Database;
}

/**
 * Stateful D1 stand-in for the singleton app-wide request gate. Conditional writes
 * see the latest shared timestamp, while per-account timestamps are only telemetry.
 */
function dbWithAtomicSlot(initialLastRequestAt: string | null = null) {
  let gateLastRequestAt = initialLastRequestAt;
  const gateUpdates: string[] = [];
  const accountUpdates: string[] = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          args = values;
          return this;
        },
        async run() {
          if (sql.startsWith("UPDATE bgg_request_gate SET last_request_at")) {
            gateUpdates.push(sql);
            const [nowIso, cutoff] = args as [string, string];
            if (gateLastRequestAt === null || gateLastRequestAt <= cutoff) {
              gateLastRequestAt = nowIso;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.startsWith("UPDATE source_accounts SET last_request_at")) {
            accountUpdates.push(String(args[2]));
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (sql.startsWith("SELECT last_request_at")) {
            return { lastRequestAt: gateLastRequestAt };
          }
          return null;
        }
      };
    }
  } as unknown as D1Database;
  return { db, gateUpdates, accountUpdates };
}

const progressed = (status: string): EnrichOutcome => ({
  outcome: "progressed",
  run: { status } as never,
  nextRequestAfterMs: 0
});

describe("BGG sync API helpers", () => {
  it("keeps the BGG collection id stable so API sync reconciles CSV imports", () =>
    expect(collectionItemId("user-1", { id: 432, collId: "8139458" })).toBe("user-1:8139458"));
  it("falls back to the BGG id when a collection id is unavailable", () =>
    expect(collectionItemId("user-1", { id: 432, collId: "" })).toBe("user-1:432"));
  it("accepts normal BGG usernames and rejects control or markup characters", () => {
    expect(normalizeUsername(" killjoy00 ")).toBe("killjoy00");
    expect(normalizeUsername("bad<name")).toBeNull();
    expect(normalizeUsername("bad\nname")).toBeNull();
  });

  it("atomically gives the shared BGG token slot to exactly one account", async () => {
    const { db, gateUpdates, accountUpdates } = dbWithAtomicSlot();
    const now = new Date("2026-09-07T16:30:00.000Z");
    const results = await Promise.all([
      claimBggSlot(db, "account-1", now),
      claimBggSlot(db, "account-2", now)
    ]);

    expect(results.sort((a, b) => a - b)).toEqual([0, 5000]);
    expect(gateUpdates[0]).toContain("UPDATE bgg_request_gate");
    expect(accountUpdates).toHaveLength(1);
    expect(await claimBggSlot(db, "account-2", new Date(now.getTime() + 5000))).toBe(0);
    expect(accountUpdates).toHaveLength(2);
  });
});

describe("background sync sweep", () => {
  const clock = () => {
    let time = 0;
    return {
      now: () => time,
      wait: async (ms: number) => {
        time += ms;
      }
    };
  };

  it("drives a run until it stops reporting as running", async () => {
    const { now, wait } = clock();
    let calls = 0;
    const result = await runBackgroundSync(
      dbWithRunningRuns([{ id: "run-1", userId: "user-1" }]),
      "token",
      {
        budgetMs: 60_000,
        now,
        wait,
        step: async () => progressed(++calls < 3 ? "running" : "complete")
      }
    );
    expect(result).toEqual({ runs: 1, steps: 3, completed: 1 });
  });

  it("stops once the wall-clock budget is spent instead of overrunning the next tick", async () => {
    const { now, wait } = clock();
    const result = await runBackgroundSync(
      dbWithRunningRuns([{ id: "run-1", userId: "user-1" }]),
      "token",
      {
        budgetMs: 12_000,
        now,
        wait,
        step: async () => progressed("running")
      }
    );
    // 5s of pacing per step, so only two steps fit inside a 12s budget.
    expect(result.steps).toBe(2);
    expect(result.completed).toBe(0);
  });

  it("yields a run when another caller owns the shared BGG token slot", async () => {
    const { now, wait } = clock();
    let calls = 0;
    const result = await runBackgroundSync(
      dbWithRunningRuns([{ id: "run-1", userId: "user-1" }]),
      "token",
      {
        budgetMs: 60_000,
        now,
        wait,
        step: async () => {
          calls++;
          return { outcome: "paced", retryAfterMs: 4000 };
        }
      }
    );
    // Retries once, then leaves the run for the next sweep.
    expect(calls).toBe(2);
    expect(result.steps).toBe(2);
  });

  it("interleaves runs from different users rather than draining one first", async () => {
    const { now, wait } = clock();
    const seen: string[] = [];
    const remaining: Record<string, number> = { "run-1": 2, "run-2": 2 };
    await runBackgroundSync(
      dbWithRunningRuns([
        { id: "run-1", userId: "user-1" },
        { id: "run-2", userId: "user-2" }
      ]),
      "token",
      {
        budgetMs: 60_000,
        now,
        wait,
        step: async (_userId, runId) => {
          seen.push(runId);
          return progressed(--remaining[runId] > 0 ? "running" : "complete");
        }
      }
    );
    expect(seen).toEqual(["run-1", "run-2", "run-1", "run-2"]);
  });

  it("abandons a run that keeps failing against BGG instead of retrying it forever", async () => {
    const { now, wait } = clock();
    let calls = 0;
    const result = await runBackgroundSync(
      dbWithRunningRuns([{ id: "run-1", userId: "user-1" }]),
      "token",
      {
        budgetMs: 60_000,
        now,
        wait,
        step: async () => {
          calls++;
          return { outcome: "bgg-error", error: "BGG unavailable" };
        }
      }
    );
    expect(calls).toBe(1);
    expect(result.completed).toBe(0);
  });
});
