import { writeFile } from "node:fs/promises";

const token = process.env.BGG_API_TOKEN;
const username = process.env.BGG_USERNAME ?? "killjoy00";
if (!token) throw new Error("BGG_API_TOKEN is required");
const root = "https://boardgamegeek.com/xmlapi2/",
  intervalMs = 5000,
  retryable = new Set([202, 429, 500, 502, 503, 504]);
let lastStarted = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const attr = (text, name) => new RegExp(`${name}="([^"]*)"`).exec(text)?.[1] ?? "";
async function request(path, params) {
  const url = new URL(path, root);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 1; attempt <= 6; attempt++) {
    const elapsed = Date.now() - lastStarted;
    if (lastStarted && elapsed < intervalMs) await sleep(intervalMs - elapsed);
    lastStarted = Date.now();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" }
    });
    console.log(`${path}: HTTP ${response.status} (attempt ${attempt})`);
    if (!retryable.has(response.status)) {
      if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`);
      return response.text();
    }
    if (attempt === 6) throw new Error(`${path} remained unavailable after ${attempt} attempts`);
  }
}

const collectionXml = await request("collection", {
  username,
  own: 1,
  excludesubtype: "boardgameexpansion"
});
const collection = [...collectionXml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)]
  .map((match) => ({
    id: Number(attr(match[1], "objectid")),
    collId: attr(match[1], "collid"),
    name: decode(/<name[^>]*>([\s\S]*?)<\/name>/.exec(match[2])?.[1]?.trim() ?? ""),
    status: (() => {
      const raw = /<status\b([^>]*)/.exec(match[2])?.[1] ?? "";
      return {
        own: attr(raw, "own") === "1",
        forTrade: attr(raw, "fortrade") === "1",
        wishlist: attr(raw, "wishlist") === "1"
      };
    })()
  }))
  .filter((item) => Number.isFinite(item.id) && item.id > 0);
if (!collection.length) throw new Error(`BGG returned no owned base games for ${username}`);
const ids = collection.slice(0, 20).map((item) => item.id);
const thingXml = await request("thing", { id: ids.join(","), stats: 1 });
const things = [...thingXml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map((match) => {
  const body = match[2],
    num = (tag) => {
      const value = Number(new RegExp(`<${tag}[^>]*value="([^"]*)"`).exec(body)?.[1]);
      return Number.isFinite(value) ? value : null;
    };
  const polls = [...body.matchAll(/<results[^>]*numplayers="([^"]+)"/g)].map((x) => x[1]);
  return {
    id: Number(attr(match[1], "id")),
    type: attr(match[1], "type"),
    name: decode(/<name[^>]*type="primary"[^>]*value="([^"]*)"/.exec(body)?.[1] ?? ""),
    year: num("yearpublished"),
    minPlayers: num("minplayers"),
    maxPlayers: num("maxplayers"),
    minutes: num("playingtime"),
    weight: num("averageweight"),
    playerCountPolls: polls
  };
});
if (!things.length) throw new Error("Thing enrichment returned no games");
const searchName = things[0].name;
const searchXml = await request("search", { query: searchName, type: "boardgame", exact: 1 });
const searchMatches = [...searchXml.matchAll(/<item\b([^>]*)>/g)]
  .map((match) => Number(attr(match[1], "id")))
  .filter(Number.isFinite);
const output = {
  generatedAt: new Date().toISOString(),
  username,
  collection: { ownedBaseGames: collection.length, sample: collection.slice(0, 5) },
  thing: { requested: ids.length, returned: things.length, sample: things.slice(0, 5) },
  search: {
    query: searchName,
    exactMatches: searchMatches.length,
    containsSampleId: searchMatches.includes(things[0].id)
  }
};
await writeFile("bgg-probe.json", JSON.stringify(output, null, 2) + "\n");
console.log(
  `Validated ${collection.length} owned base games; enriched ${things.length}; exact search returned ${searchMatches.length} result(s).`
);
