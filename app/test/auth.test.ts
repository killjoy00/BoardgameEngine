import { describe, expect, it } from "vitest";
import { expiresIn, hash, isEmail, normalizeEmail, randomCode, randomToken } from "../src/auth";

describe("authentication primitives", () => {
  it("normalizes invited addresses", () => expect(normalizeEmail(" KillJoy00@Yahoo.COM ")).toBe("killjoy00@yahoo.com"));
  it("rejects malformed addresses", () => expect(isEmail("killjoy00")).toBe(false));
  it("creates copyable unambiguous codes", () => expect(randomCode()).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/));
  it("creates URL-safe tokens", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/));
  it("hashes instead of retaining secrets", async () => expect(await hash("secret")).toMatch(/^[a-f0-9]{64}$/));
  it("expires login tokens after thirty minutes", () => expect(expiresIn(30, new Date("2026-08-26T12:00:00.000Z"))).toBe("2026-08-26T12:30:00.000Z"));
});
