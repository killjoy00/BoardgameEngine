import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { hash } from "./auth";
import {
  recommend,
  recommendWithPolicy,
  RECOMMENDATION_POLICIES,
  type Candidate,
  type RecommendationPolicyName
} from "./domain";

type Bindings = { DB: D1Database };
type User = { id: string; email: string; role: string };
type Variables = { user: User };
type TableMode = "any" | "competitive" | "cooperative";
type PickerBody = {
  players?: number;
  playerBand?: string;
  minutes?: number;
  minWeight?: number;
  maxWeight?: number;
  includeForTrade?: boolean;
  mode?: string;
};
type PickerRow = {
  id: number;
  name: string;
  sourceName: string | null;
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
  weight: number;
  pollKey: string;
  best: number;
  recommended: number;
  notRecommended: number;
  cooperative: number;
  forTrade: number;
};
type ValidPicker = {
  players: number;
  playerBand: string;
  pollKey: string;
  minutes: number;
  minWeight: number;
  maxWeight: number;
  includeForTrade: boolean;
  mode: TableMode;
};
type LabFeedback = {
  bggId?: number;
  players?: number;
  playerBand?: string;
  minutes?: number;
  minWeight?: number;
  maxWeight?: number;
  mode?: string;
  policy?: string;
  rank?: number;
  score?: number;
  label?: string;
};
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const LAB_PLAYER_KEYS = ["2", "3", "4", "5", "6", "7", "8", "8+"];

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

api.get("/status", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT ci.bgg_id) owned,COUNT(DISTINCT CASE WHEN g.bgg_fetched_at IS NOT NULL THEN ci.bgg_id END) enriched FROM collection_items ci JOIN games g ON g.id=ci.bgg_id WHERE ci.user_id=? AND ci.own=1"
  )
    .bind(user.id)
    .first<{ owned: number; enriched: number }>();
  const account = await c.env.DB.prepare(
    "SELECT username,last_collection_sync_at lastCollectionSyncAt,last_full_sync_at lastFullSyncAt FROM source_accounts WHERE user_id=? AND provider='bgg'"
  )
    .bind(user.id)
    .first();
  return c.json({
    account: account ?? null,
    owned: Number(row?.owned ?? 0),
    enriched: Number(row?.enriched ?? 0)
  });
});

api.post("/recommend", async (c) => {
  const user = c.get("user"),
    body = await safeJson<PickerBody>(c),
    input = validatePicker(body);
  if (!input.ok) return c.json({ error: input.error }, 400);
  const value = input.value,
    rows = await loadRows(c.env.DB, user.id, [
      value.pollKey,
      value.pollKey === "8+" ? "8" : value.pollKey
    ]),
    chosenRows = preferPollRows(rows, value.pollKey),
    filteredRows = applyCollectionFilters(chosenRows, value.includeForTrade, value.mode),
    candidates = toCandidates(filteredRows),
    ranked = recommend(candidates, value.players, value.minutes, value.minWeight, value.maxWeight),
    sourceNames = new Map(filteredRows.map((row) => [Number(row.id), row.sourceName])),
    cooperativeById = new Map(
      filteredRows.map((row) => [Number(row.id), Number(row.cooperative) === 1])
    ),
    results = ranked.map((item) =>
      formatResult(
        item,
        sourceNames.get(item.id) ?? null,
        value.players,
        value.playerBand,
        cooperativeById.get(item.id) ?? false
      )
    );
  return c.json({
    query: value,
    eligibleCount: candidates.filter((game) =>
      isEligible(game, value.players, value.minutes, value.minWeight, value.maxWeight)
    ).length,
    results,
    relaxations: results.length < 5 ? suggestRelaxations(chosenRows, value) : []
  });
});

api.get("/lab", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Administrator access required" }, 403);
  const rows = await loadRows(c.env.DB, user.id, LAB_PLAYER_KEYS);
  const scenario = validateLabQuery(c.req.query());
  const matrix = buildLabMatrix(rows);
  const selected = buildLabComparison(rows, scenario);
  const feedback = await c.env.DB.prepare(
    "SELECT label,COUNT(*) count FROM recommendation_feedback WHERE user_id=? GROUP BY label"
  )
    .bind(user.id)
    .all<{ label: string; count: number }>();
  return c.json({
    matrix,
    selected,
    policies: Object.values(RECOMMENDATION_POLICIES).map((p) => ({ name: p.name, label: p.label })),
    feedback: Object.fromEntries(feedback.results.map((x) => [x.label, Number(x.count)]))
  });
});

api.post("/feedback", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Administrator access required" }, 403);
  const body = await safeJson<LabFeedback>(c),
    parsed = validateFeedback(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const f = parsed.value;
  await c.env.DB.prepare(
    "INSERT INTO recommendation_feedback(id,user_id,bgg_id,players,player_band,minutes,min_weight,max_weight,mode,policy,rank,score,label)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      f.bggId,
      f.players,
      f.playerBand,
      f.minutes,
      f.minWeight,
      f.maxWeight,
      f.mode,
      f.policy,
      f.rank,
      f.score,
      f.label
    )
    .run();
  return c.json({ ok: true }, 201);
});

api.get("/feedback", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Administrator access required" }, 403);
  const rows = await c.env.DB.prepare(
    "SELECT rf.id,rf.bgg_id bggId,g.name,rf.players,rf.player_band playerBand,rf.minutes,rf.min_weight minWeight,rf.max_weight maxWeight,rf.mode,rf.policy,rf.rank,rf.score,rf.label,rf.created_at createdAt FROM recommendation_feedback rf JOIN games g ON g.id=rf.bgg_id WHERE rf.user_id=? ORDER BY rf.created_at DESC LIMIT 200"
  )
    .bind(user.id)
    .all();
  return c.json(rows.results);
});

export default api;

export function validatePicker(
  body: Partial<PickerBody>
): { ok: true; value: ValidPicker } | { ok: false; error: string } {
  const players = Number(body.players),
    minutes = Number(body.minutes),
    minWeight = Number(body.minWeight),
    maxWeight = Number(body.maxWeight);
  if (!Number.isInteger(players) || players < 1 || players > 20)
    return { ok: false, error: "Player count must be between 1 and 20" };
  if (!Number.isFinite(minutes) || minutes < 15 || minutes > 720)
    return { ok: false, error: "Available time must be between 15 and 720 minutes" };
  if (
    !Number.isFinite(minWeight) ||
    !Number.isFinite(maxWeight) ||
    minWeight < 0 ||
    maxWeight > 5 ||
    minWeight > maxWeight
  )
    return { ok: false, error: "Weight range must stay between 0 and 5" };
  const playerBand = (body.playerBand ?? String(players)).trim();
  if (playerBand !== String(players) && !(players === 8 && playerBand === "8+"))
    return { ok: false, error: "Unsupported player-count band" };
  const mode = (body.mode ?? "any") as TableMode;
  if (!["any", "competitive", "cooperative"].includes(mode))
    return { ok: false, error: "Table style must be either, competitive, or cooperative" };
  return {
    ok: true,
    value: {
      players,
      playerBand,
      pollKey: playerBand,
      minutes,
      minWeight,
      maxWeight,
      includeForTrade: body.includeForTrade === true,
      mode
    }
  };
}

export function preferPollRows(rows: PickerRow[], preferredKey: string): PickerRow[] {
  const chosen = new Map<number, PickerRow>();
  for (const row of rows) {
    const id = Number(row.id),
      current = chosen.get(id);
    if (!current || (row.pollKey === preferredKey && current.pollKey !== preferredKey))
      chosen.set(id, row);
  }
  return [...chosen.values()];
}
export function suggestRelaxations(rows: PickerRow[], input: ValidPicker): string[] {
  const baseline = eligibleRows(
      applyCollectionFilters(rows, input.includeForTrade, input.mode),
      input
    ).length,
    suggestions: { added: number; text: string }[] = [];
  const currentFiltered = applyCollectionFilters(rows, input.includeForTrade, input.mode);
  for (const threshold of [60, 90, 120, 150, 180, 240, 300, 360, 480, 720]) {
    if (threshold <= input.minutes) continue;
    const count = eligibleRows(currentFiltered, { ...input, minutes: threshold }).length,
      added = count - baseline;
    if (added > 0) {
      suggestions.push({
        added,
        text: `Allow ${threshold} minutes to add ${added} ${added === 1 ? "game" : "games"}`
      });
      break;
    }
  }
  if (input.minWeight > 0 || input.maxWeight < 5) {
    const count = eligibleRows(currentFiltered, { ...input, minWeight: 0, maxWeight: 5 }).length,
      added = count - baseline;
    if (added > 0)
      suggestions.push({
        added,
        text: `Allow any complexity to add ${added} ${added === 1 ? "game" : "games"}`
      });
  }
  if (input.mode !== "any") {
    const count = eligibleRows(
        applyCollectionFilters(rows, input.includeForTrade, "any"),
        input
      ).length,
      added = count - baseline;
    if (added > 0)
      suggestions.push({
        added,
        text: `Allow either table style to add ${added} ${added === 1 ? "game" : "games"}`
      });
  }
  if (!input.includeForTrade) {
    const count = eligibleRows(applyCollectionFilters(rows, true, input.mode), input).length,
      added = count - baseline;
    if (added > 0)
      suggestions.push({
        added,
        text: `Include for-trade games to add ${added} ${added === 1 ? "game" : "games"}`
      });
  }
  return suggestions
    .sort((a, b) => b.added - a.added)
    .slice(0, 3)
    .map((x) => x.text);
}

function buildLabMatrix(rows: PickerRow[]) {
  const weights = [
      { key: "light", label: "Light", min: 0, max: 2 },
      { key: "medium", label: "Medium", min: 2, max: 3.25 },
      { key: "heavy", label: "Heavy", min: 3.25, max: 5 }
    ],
    out: any[] = [];
  for (const players of [2, 3, 4, 5, 6, 7, 8]) {
    const playerBand = players === 8 ? "8+" : String(players),
      playerRows = preferPollRows(rows, playerBand);
    for (const minutes of [45, 90, 180])
      for (const weight of weights) {
        const input: ValidPicker = {
            players,
            playerBand,
            pollKey: playerBand,
            minutes,
            minWeight: weight.min,
            maxWeight: weight.max,
            includeForTrade: false,
            mode: "any"
          },
          filtered = applyCollectionFilters(playerRows, false, "any"),
          ranked = recommend(toCandidates(filtered), players, minutes, weight.min, weight.max, 3);
        out.push({
          id: `${playerBand}-${minutes}-${weight.key}`,
          players,
          playerBand,
          minutes,
          weight: weight.key,
          weightLabel: weight.label,
          eligibleCount: eligibleRows(filtered, input).length,
          top: ranked.map((x) => ({
            id: x.id,
            name: x.name,
            score: x.score,
            best: Math.round(x.bestShare * 100),
            notRecommended: Math.round(x.downside * 100),
            votes: x.votes
          }))
        });
      }
  }
  return out;
}

function buildLabComparison(rows: PickerRow[], input: ValidPicker) {
  const selectedRows = preferPollRows(rows, input.pollKey),
    filtered = applyCollectionFilters(selectedRows, input.includeForTrade, input.mode),
    candidates = toCandidates(filtered);
  return {
    query: input,
    eligibleCount: eligibleRows(filtered, input).length,
    policies: (Object.keys(RECOMMENDATION_POLICIES) as RecommendationPolicyName[]).map(
      (policy) => ({
        policy,
        label: RECOMMENDATION_POLICIES[policy].label,
        results: recommendWithPolicy(
          candidates,
          input.players,
          input.minutes,
          input.minWeight,
          input.maxWeight,
          policy,
          10
        ).map((x, index) => ({
          rank: index + 1,
          id: x.id,
          name: x.name,
          minutes: x.minutes,
          weight: x.weight,
          best: x.best,
          recommended: x.recommended,
          notRecommended: x.notRecommended,
          votes: x.votes,
          bestPercent: Math.round(x.bestShare * 100),
          recommendedPercent: Math.round(x.recommendedShare * 100),
          notRecommendedPercent: Math.round(x.downside * 100),
          confidence: Math.round(x.confidence * 100),
          score: x.score,
          reason: x.reason,
          warning: x.warning,
          components: x.components
        }))
      })
    )
  };
}

function validateLabQuery(query: Record<string, string>): ValidPicker {
  const result = validatePicker({
    players: Number(query.players || 4),
    playerBand: query.playerBand || query.band || "4",
    minutes: Number(query.minutes || 90),
    minWeight: Number(query.minWeight || 2),
    maxWeight: Number(query.maxWeight || 3.25),
    mode: query.mode || "any",
    includeForTrade: query.includeForTrade === "true"
  });
  return result.ok
    ? result.value
    : {
        players: 4,
        playerBand: "4",
        pollKey: "4",
        minutes: 90,
        minWeight: 2,
        maxWeight: 3.25,
        includeForTrade: false,
        mode: "any"
      };
}
function validateFeedback(
  body: Partial<LabFeedback>
): { ok: true; value: Required<LabFeedback> } | { ok: false; error: string } {
  const bggId = Number(body.bggId),
    players = Number(body.players),
    minutes = Number(body.minutes),
    minWeight = Number(body.minWeight),
    maxWeight = Number(body.maxWeight),
    rank = Number(body.rank),
    score = Number(body.score),
    playerBand = String(body.playerBand || players),
    mode = String(body.mode || "any"),
    policy = String(body.policy || "balanced"),
    label = String(body.label || "");
  if (
    !Number.isInteger(bggId) ||
    bggId < 1 ||
    !Number.isInteger(players) ||
    players < 1 ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(minWeight) ||
    !Number.isFinite(maxWeight) ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    !Number.isFinite(score)
  )
    return { ok: false, error: "Invalid recommendation feedback" };
  if (
    !["any", "competitive", "cooperative"].includes(mode) ||
    !(policy in RECOMMENDATION_POLICIES) ||
    !["great", "reasonable", "wrong"].includes(label)
  )
    return { ok: false, error: "Invalid recommendation feedback choice" };
  return {
    ok: true,
    value: {
      bggId,
      players,
      playerBand,
      minutes,
      minWeight,
      maxWeight,
      mode,
      policy,
      rank,
      score,
      label
    }
  };
}
async function loadRows(db: D1Database, userId: string, pollKeys: string[]): Promise<PickerRow[]> {
  const keys = [...new Set(pollKeys)],
    placeholders = keys.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT g.id,g.name,MAX(ci.source_name) sourceName,g.min_players minPlayers,g.max_players maxPlayers,g.play_time minutes,g.weight,gp.player_count pollKey,gp.best_votes best,gp.recommended_votes recommended,gp.not_recommended_votes notRecommended,MAX(ci.for_trade) forTrade,EXISTS(SELECT 1 FROM game_tags gt WHERE gt.bgg_id=g.id AND gt.kind='mechanic' AND gt.name='Cooperative Game') cooperative FROM collection_items ci JOIN games g ON g.id=ci.bgg_id JOIN game_polls gp ON gp.bgg_id=g.id AND gp.player_count IN (${placeholders}) WHERE ci.user_id=? AND ci.own=1 AND g.bgg_fetched_at IS NOT NULL AND g.min_players IS NOT NULL AND g.max_players IS NOT NULL AND g.play_time>0 AND g.weight>0 GROUP BY g.id,g.name,g.min_players,g.max_players,g.play_time,g.weight,gp.player_count,gp.best_votes,gp.recommended_votes,gp.not_recommended_votes LIMIT 10000`
    )
    .bind(...keys, userId)
    .all<PickerRow>();
  return rows.results;
}
function applyCollectionFilters(rows: PickerRow[], includeForTrade: boolean, mode: TableMode) {
  return rows.filter(
    (row) =>
      (includeForTrade || Number(row.forTrade) === 0) &&
      (mode === "any" ||
        (mode === "cooperative" ? Number(row.cooperative) === 1 : Number(row.cooperative) === 0))
  );
}
function toCandidates(rows: PickerRow[]): Candidate[] {
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    minPlayers: Number(row.minPlayers),
    maxPlayers: Number(row.maxPlayers),
    minutes: Number(row.minutes),
    weight: Number(row.weight),
    best: Number(row.best),
    recommended: Number(row.recommended),
    notRecommended: Number(row.notRecommended)
  }));
}
function eligibleRows(
  rows: PickerRow[],
  input: Pick<ValidPicker, "players" | "minutes" | "minWeight" | "maxWeight">
) {
  return rows.filter(
    (row) =>
      input.players >= Number(row.minPlayers) &&
      input.players <= Number(row.maxPlayers) &&
      Number(row.minutes) <= input.minutes &&
      Number(row.weight) >= input.minWeight &&
      Number(row.weight) <= input.maxWeight
  );
}
function isEligible(
  game: Candidate,
  players: number,
  minutes: number,
  minWeight: number,
  maxWeight: number
) {
  return (
    players >= game.minPlayers &&
    players <= game.maxPlayers &&
    game.minutes <= minutes &&
    game.weight >= minWeight &&
    game.weight <= maxWeight
  );
}
function formatResult(
  item: ReturnType<typeof recommend>[number],
  sourceName: string | null,
  players: number,
  playerBand: string,
  cooperative: boolean
) {
  const total = item.votes,
    percent = (value: number) => (total ? Math.round((value / total) * 100) : 0);
  return {
    id: item.id,
    name: item.name,
    sourceName: sourceName && sourceName !== item.name ? sourceName : null,
    players,
    playerBand,
    minutes: item.minutes,
    weight: item.weight,
    best: item.best,
    recommended: item.recommended,
    notRecommended: item.notRecommended,
    votes: total,
    bestPercent: percent(item.best),
    positivePercent: percent(item.best + item.recommended),
    notRecommendedPercent: percent(item.notRecommended),
    confidence: item.confidence,
    score: item.score,
    cooperative,
    warning: item.warning,
    reason: item.reason,
    components: item.components
  };
}
async function safeJson<T>(c: { req: { json: () => Promise<T> } }): Promise<Partial<T>> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}
