import { describe, it, expect } from "vitest";
import { preferPollRows, suggestRelaxations, validatePicker } from "../src/picker-api";

describe("live picker input", () => {
  it("accepts a normal table and defaults optional filters", () => {
    const result = validatePicker({ players: 4, minutes: 90, minWeight: 2, maxWeight: 3.25 });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value).toEqual({
        players: 4,
        playerBand: "4",
        pollKey: "4",
        minutes: 90,
        minWeight: 2,
        maxWeight: 3.25,
        includeForTrade: false,
        mode: "any"
      });
  });
  it("accepts the 8+ player band", () => {
    const result = validatePicker({
      players: 8,
      playerBand: "8+",
      minutes: 120,
      minWeight: 0,
      maxWeight: 5
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pollKey).toBe("8+");
  });
  it("rejects unsupported player bands", () =>
    expect(
      validatePicker({ players: 7, playerBand: "7+", minutes: 90, minWeight: 0, maxWeight: 5 }).ok
    ).toBe(false));
  it("rejects impossible player counts", () =>
    expect(validatePicker({ players: 0, minutes: 90, minWeight: 0, maxWeight: 5 }).ok).toBe(false));
  it("rejects inverted weight ranges", () =>
    expect(validatePicker({ players: 4, minutes: 90, minWeight: 4, maxWeight: 2 }).ok).toBe(false));
  it("accepts cooperative mode and an explicit include-for-trade choice", () => {
    const result = validatePicker({
      players: 6,
      minutes: 180,
      minWeight: 0,
      maxWeight: 5,
      includeForTrade: true,
      mode: "cooperative"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.includeForTrade).toBe(true);
      expect(result.value.mode).toBe("cooperative");
    }
  });
  it("rejects unknown table styles", () =>
    expect(
      validatePicker({ players: 4, minutes: 90, minWeight: 0, maxWeight: 5, mode: "chaotic" }).ok
    ).toBe(false));
  it("prefers an 8+ poll row over exact 8 for the same game", () => {
    const base = {
      id: 1,
      name: "A",
      sourceName: null,
      minPlayers: 2,
      maxPlayers: 10,
      minutes: 60,
      weight: 2,
      best: 10,
      recommended: 10,
      notRecommended: 1,
      cooperative: 0,
      forTrade: 0
    };
    const rows = preferPollRows(
      [
        { ...base, pollKey: "8" },
        { ...base, pollKey: "8+", best: 20 }
      ],
      "8+"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pollKey).toBe("8+");
    expect(rows[0].best).toBe(20);
  });
  it("reports the actual number of games unlocked by relaxing time", () => {
    const make = (id: number, minutes: number) => ({
      id,
      name: "G" + id,
      sourceName: null,
      minPlayers: 2,
      maxPlayers: 5,
      minutes,
      weight: 2.5,
      pollKey: "4",
      best: 20,
      recommended: 20,
      notRecommended: 2,
      cooperative: 0,
      forTrade: 0
    });
    const input = validatePicker({ players: 4, minutes: 90, minWeight: 2, maxWeight: 3.25 });
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    const suggestions = suggestRelaxations([make(1, 60), make(2, 120), make(3, 120)], input.value);
    expect(suggestions.some((x) => x.includes("Allow 120 minutes") && x.includes("2 games"))).toBe(
      true
    );
  });
});
