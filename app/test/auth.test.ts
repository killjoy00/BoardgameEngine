import { describe, expect, it } from "vitest";
import {
  expiresIn,
  hash,
  isEmail,
  loadSessionUser,
  newSessionWindow,
  nextSessionExpiry,
  normalizeEmail,
  randomCode,
  randomToken
} from "../src/auth";

/** Records the SQL the session lookup issues and replays a canned row. */
function fakeDb(row: Record<string, unknown> | null) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const entry = { sql, args: [] as unknown[] };
      return {
        bind(...args: unknown[]) {
          entry.args = args;
          statements.push(entry);
          return this;
        },
        async first() {
          return row;
        },
        async run() {
          return { meta: { changes: 1 } };
        }
      };
    }
  } as unknown as D1Database;
  return { db, statements };
}

describe("authentication primitives", () => {
  it("normalizes invited addresses", () =>
    expect(normalizeEmail(" KillJoy00@Yahoo.COM ")).toBe("killjoy00@yahoo.com"));
  it("rejects malformed addresses", () => expect(isEmail("killjoy00")).toBe(false));
  it("creates copyable unambiguous codes", () =>
    expect(randomCode()).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/));
  it("creates URL-safe tokens", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/));
  it("hashes instead of retaining secrets", async () =>
    expect(await hash("secret")).toMatch(/^[a-f0-9]{64}$/));
  it("expires login tokens after thirty minutes", () =>
    expect(expiresIn(30, new Date("2026-08-26T12:00:00.000Z"))).toBe("2026-08-26T12:30:00.000Z"));
});

describe("session lifetime", () => {
  const signIn = new Date("2026-08-26T12:00:00.000Z");

  it("gives a new session both an idle and an absolute deadline", () => {
    expect(newSessionWindow(signIn)).toEqual({
      expiresAt: "2026-09-25T12:00:00.000Z",
      absoluteExpiresAt: "2027-09-30T12:00:00.000Z"
    });
  });

  it("slides the idle window forward while a session stays in use", () =>
    expect(
      nextSessionExpiry("2027-09-30T12:00:00.000Z", new Date("2026-09-20T12:00:00.000Z"))
    ).toBe("2026-10-20T12:00:00.000Z"));

  it("never slides past the absolute deadline", () =>
    expect(
      nextSessionExpiry("2026-09-25T12:00:00.000Z", new Date("2026-09-20T12:00:00.000Z"))
    ).toBe("2026-09-25T12:00:00.000Z"));

  it("treats a session with no recorded expiry as expired", () =>
    expect(nextSessionExpiry(null, signIn)).toBe("2026-09-25T12:00:00.000Z"));
});

describe("session lookup", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("rejects disabled accounts and expired sessions in a single query", async () => {
    const { db, statements } = fakeDb(null);
    expect(await loadSessionUser(db, "token", now)).toBeNull();
    // The page routes previously omitted the disabled check; there is now one
    // query and every surface shares it.
    expect(statements[0].sql).toContain("users.disabled_at IS NULL");
    expect(statements[0].sql).toContain("sessions.expires_at>?");
    expect(statements[0].args[1]).toBe(now.toISOString());
  });

  it("refreshes a session that has not been seen for an hour", async () => {
    const { db, statements } = fakeDb({
      id: "user-1",
      email: "owner@example.com",
      role: "admin",
      lastSeenAt: "2026-08-26T09:00:00.000Z",
      absoluteExpiresAt: "2027-09-30T12:00:00.000Z"
    });
    expect(await loadSessionUser(db, "token", now)).toEqual({
      id: "user-1",
      email: "owner@example.com",
      role: "admin"
    });
    expect(statements[1].sql).toContain("UPDATE sessions SET last_seen_at=?,expires_at=?");
    expect(statements[1].args[1]).toBe("2026-09-25T12:00:00.000Z");
  });

  it("does not rewrite the session row on every request", async () => {
    const { db, statements } = fakeDb({
      id: "user-1",
      email: "owner@example.com",
      role: "member",
      lastSeenAt: "2026-08-26T11:59:00.000Z",
      absoluteExpiresAt: "2027-09-30T12:00:00.000Z"
    });
    await loadSessionUser(db, "token", now);
    expect(statements).toHaveLength(1);
  });
});
