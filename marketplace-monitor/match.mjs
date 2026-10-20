// Deterministic title/location matching. We prefer missed matches to unrelated alerts.
const IGNORED = new Set(["the", "of", "for", "and", "a", "an", "to", "with", "at", "in", "on",
  "edition", "board", "game", "games", "card", "cards", "new", "used", "sealed", "complete"]);
const ACCESSORY = /\b(organizer|insert|sleeves?|playmat|replacement|parts only|pieces only|rulebook|empty box|storage box|3d.print|miniatures? only)\b/i;
const AUSTIN_NEAR = new Set(["austin", "cedar park", "pflugerville", "round rock", "buda", "kyle",
  "lakeway", "bee cave", "sunset valley", "west lake hills", "manor", "del valle",
  "dripping springs", "rollingwood", "westlake", "hutto"]);
const ALIASES = {
  367150: ["Dune War for Arrakis"],
  380109: ["Gibberers"],
  421006: ["Duel for Middle Earth", "Lord of the Rings Duel Middle Earth"],
  251726: ["Confident board game"],
  344554: ["Decorum board game"],
  284189: ["Foundations of Rome board game"],
  367466: ["Dune Imperium Immortality"],
  425549: ["Moon Colony Bloodbath"],
  466909: ["Jibber Jabble board game"],
  425276: ["Unmatched Teenage Mutant Ninja Turtles"],
  422541: ["Star Trek Captains Chair"]
};

export function normalize(text) {
  return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tokens(text) {
  return [...new Set(normalize(text).split(" ").filter((s) => s.length > 1 && !IGNORED.has(s)))];
}
export function titleVariants(game) {
  const initial = game.name;
  const list = [initial, ...(ALIASES[game.bggId] || [])];
  return [...new Set(list)].filter(Boolean);
}
export function searchTerm(game) {
  if (ALIASES[game.bggId]) return ALIASES[game.bggId][0];
  // Keep distinguishing subtitles: searching for only "The Lord of the Rings"
  // would produce hundreds of unrelated Marketplace results.
  return normalize(game.name).split(" ").length <= 2
    ? game.name + " board game"
    : game.name;
}

function matchingTitle(game, listingTitle) {
  const listing = normalize(listingTitle);
  if (!listing || ACCESSORY.test(listingTitle)) return false;
  const have = new Set(tokens(listing));
  return titleVariants(game).some((variant) => {
    const needed = tokens(variant);
    if (!needed.length) return false;
    const hits = needed.filter((word) => have.has(word)).length;
    if (needed.length === 1) {
      // A single vague word is not sufficient without a game qualifier.
      return hits === 1 && (listing === normalize(variant) ||
        /\b(board game|card game|tabletop|sealed game)\b/i.test(listingTitle));
    }
    // Do not accept incomplete titles such as a base game without its expansion.
    return hits === needed.length;
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function localListing(listing) {
  if (listing.state && String(listing.state).toLowerCase() !== "tx") return false;
  if (Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)) {
    return haversineKm(30.2672, -97.7431, listing.latitude, listing.longitude) <= 32.2;
  }
  // Basic Marketplace feeds offer city but not exact coordinates. Conservative whitelist.
  const city = normalize(listing.city);
  return Boolean(city && AUSTIN_NEAR.has(city));
}
export function matchListing(game, listing) {
  return Boolean(game && listing && localListing(listing) && matchingTitle(game, listing.title));
}
export function matchWishlist(games, listings) {
  const unique = new Map();
  for (const listing of listings) {
    for (const game of games) {
      if (!matchListing(game, listing)) continue;
      const key = String(listing.id || listing.url) + ":" + game.bggId;
      unique.set(key, {
        listingId: String(listing.id || ""),
        bggId: game.bggId,
        game: game.name,
        priority: game.priority,
        listing: listing.title,
        price: listing.price,
        city: listing.city,
        url: listing.url
      });
    }
  }
  return [...unique.values()].sort((a, b) => a.priority - b.priority || a.game.localeCompare(b.game));
}
