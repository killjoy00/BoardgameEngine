import { describe, it, expect } from "vitest";
import {
  BggClient,
  batches,
  fetchWithBackoff,
  parseCollectionXml,
  parseSearchXml,
  parseThingXml
} from "../src/bgg";

describe("BGG adapter", () => {
  it("parses Thing metadata and exact-count polls", () => {
    const x = parseThingXml(
      '<?xml version="1.0"?><items><item type="boardgame" id="1"><thumbnail>https://img/thumb.jpg</thumbnail><image>https://img/full.jpg</image><name type="primary" value="Fixture &amp; Friends"/><yearpublished value="2024"/><minplayers value="2"/><maxplayers value="4"/><playingtime value="60"/><link type="boardgamecategory" id="10" value="Strategy"/><link type="boardgamemechanic" id="20" value="Drafting"/><statistics><ratings><averageweight value="2.75"/></ratings></statistics><poll name="suggested_numplayers"><results numplayers="4"><result value="Best" numvotes="20"/><result value="Recommended" numvotes="25"/><result value="Not Recommended" numvotes="5"/></results></poll></item></items>'
    )[0];
    expect(x).toMatchObject({
      id: 1,
      type: "boardgame",
      name: "Fixture & Friends",
      year: 2024,
      minPlayers: 2,
      maxPlayers: 4,
      minutes: 60,
      weight: 2.75,
      categories: [{ id: 10, name: "Strategy" }],
      mechanics: [{ id: 20, name: "Drafting" }]
    });
    expect(x.polls["4"]).toEqual({ best: 20, recommended: 25, notRecommended: 5 });
  });
  it("parses public collection statuses", () => {
    const x = parseCollectionXml(
      '<items><item objecttype="thing" objectid="123" subtype="boardgame" collid="987"><name sortindex="1">My Game</name><status own="1" fortrade="0" wishlist="1" wishlistpriority="2"/><stats><rating value="8.5"/></stats></item></items>'
    )[0];
    expect(x).toEqual({
      id: 123,
      collId: "987",
      name: "My Game",
      subtype: "boardgame",
      own: true,
      forTrade: false,
      wishlist: true,
      wishlistPriority: 2,
      rating: 8.5
    });
  });
  it("parses search results", () =>
    expect(
      parseSearchXml(
        '<items><item type="boardgame" id="42"><name type="primary" value="Exact Game"/><yearpublished value="2020"/></item></items>'
      )
    ).toEqual([{ id: 42, type: "boardgame", name: "Exact Game", year: 2020 }]));
  it("batches at twenty", () =>
    expect(batches([...Array(41).keys()]).map((x) => x.length)).toEqual([20, 20, 1]));
  it("uses a five-second retry interval by default", async () => {
    let n = 0;
    const waits: number[] = [];
    const r = await fetchWithBackoff(
      async () => new Response("", { status: ++n < 3 ? 202 : 200 }),
      async (ms) => {
        waits.push(ms);
      }
    );
    expect(r.status).toBe(200);
    expect(waits).toEqual([5000, 5000]);
  });
  it("reports each HTTP attempt without exposing request content", async () => {
    let n = 0;
    const seen: { status: number; attempt: number }[] = [];
    const r = await fetchWithBackoff(
      async () => new Response("", { status: ++n === 1 ? 429 : 200 }),
      async () => {},
      5,
      0,
      (status, attempt) => {
        seen.push({ status, attempt });
      }
    );
    expect(r.status).toBe(200);
    expect(seen).toEqual([
      { status: 429, attempt: 1 },
      { status: 200, attempt: 2 }
    ]);
  });
  it("sends the application token as a Bearer header", async () => {
    let auth = "";
    const client = new BggClient("secret", {
      minIntervalMs: 0,
      fetcher: async (_input, init) => {
        auth = new Headers(init?.headers).get("Authorization") ?? "";
        return new Response(
          '<items><item type="boardgame" id="1"><name value="A"/></item></items>'
        );
      }
    });
    await client.search("A", true);
    expect(auth).toBe("Bearer secret");
  });
  it("calls the Worker global fetch with the global receiver", async () => {
    const original = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = function (this: unknown, _input: RequestInfo | URL, _init?: RequestInit) {
      receiver = this;
      return Promise.resolve(
        new Response('<items><item type="boardgame" id="1"><name value="A"/></item></items>')
      );
    } as typeof fetch;
    try {
      const client = new BggClient("secret", { minIntervalMs: 0 });
      await client.search("A", true);
      expect(receiver).toBe(globalThis);
    } finally {
      globalThis.fetch = original;
    }
  });
});
