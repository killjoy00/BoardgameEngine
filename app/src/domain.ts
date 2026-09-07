export function allocate(total: number, weights: number[]): number[] {
  if (!weights.length || weights.some((x) => x < 0) || weights.every((x) => x === 0))
    throw new Error("Positive allocation weights required");
  const sum = weights.reduce((a, b) => a + b, 0),
    raw = weights.map((x) => (total * x) / sum),
    base = raw.map(Math.floor);
  let remainder = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - base[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let n = 0; n < remainder; n++) base[order[n % order.length].i]++;
  return base;
}

export type Candidate = {
  id: number;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
  weight: number;
  best: number;
  recommended: number;
  notRecommended: number;
};
export type RecommendationPolicyName = "balanced" | "best-seat" | "cautious" | "broad-positive";
type Policy = {
  name: RecommendationPolicyName;
  label: string;
  bestWeight: number;
  recommendedWeight: number;
  negativeWeight: number;
  priorStrength: number;
  priorScore: number;
};
export const RECOMMENDATION_POLICIES: Record<RecommendationPolicyName, Policy> = {
  balanced: {
    name: "balanced",
    label: "Balanced",
    bestWeight: 1.2,
    recommendedWeight: 0.68,
    negativeWeight: 1.35,
    priorStrength: 24,
    priorScore: 0.18
  },
  "best-seat": {
    name: "best-seat",
    label: "Best seat",
    bestWeight: 1.55,
    recommendedWeight: 0.42,
    negativeWeight: 1.3,
    priorStrength: 24,
    priorScore: 0.18
  },
  cautious: {
    name: "cautious",
    label: "Cautious",
    bestWeight: 1.1,
    recommendedWeight: 0.62,
    negativeWeight: 1.8,
    priorStrength: 30,
    priorScore: 0.14
  },
  "broad-positive": {
    name: "broad-positive",
    label: "Broad positive",
    bestWeight: 1,
    recommendedWeight: 0.95,
    negativeWeight: 0.8,
    priorStrength: 18,
    priorScore: 0.22
  }
};

export function recommend(
  games: Candidate[],
  players: number,
  maxMinutes = Infinity,
  minWeight = 0,
  maxWeight = 5,
  limit = 5
) {
  return recommendWithPolicy(games, players, maxMinutes, minWeight, maxWeight, "balanced", limit);
}
export function recommendWithPolicy(
  games: Candidate[],
  players: number,
  maxMinutes = Infinity,
  minWeight = 0,
  maxWeight = 5,
  policyName: RecommendationPolicyName = "balanced",
  limit = 5
) {
  const policy = RECOMMENDATION_POLICIES[policyName];
  return games
    .filter(
      (g) =>
        players >= g.minPlayers &&
        players <= g.maxPlayers &&
        g.minutes <= maxMinutes &&
        g.weight >= minWeight &&
        g.weight <= maxWeight
    )
    .map((g) => scoreCandidate(g, players, policy))
    .sort((a, b) => b.score - a.score || b.bestShare - a.bestShare || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function scoreCandidate(
  g: Candidate,
  players: number,
  policy: Policy = RECOMMENDATION_POLICIES.balanced
) {
  const votes = g.best + g.recommended + g.notRecommended,
    bestShare = votes ? g.best / votes : 0,
    recommendedShare = votes ? g.recommended / votes : 0,
    downside = votes ? g.notRecommended / votes : 1,
    positive = bestShare + recommendedShare,
    confidence = votes / (votes + policy.priorStrength),
    raw =
      bestShare * policy.bestWeight +
      recommendedShare * policy.recommendedWeight -
      downside * policy.negativeWeight,
    score = raw * confidence + policy.priorScore * (1 - confidence),
    warning =
      downside >= 0.15
        ? `High downside: ${Math.round(downside * 100)}% do not recommend`
        : downside > 0.1
          ? `Caution: ${Math.round(downside * 100)}% do not recommend`
          : votes < 15
            ? `Small sample: ${votes} votes`
            : null;
  return {
    ...g,
    votes,
    score,
    warning,
    reason: explainRecommendation({
      players,
      bestShare,
      recommendedShare,
      downside,
      positive,
      votes
    }),
    bestShare,
    recommendedShare,
    downside,
    positive,
    confidence,
    policy: policy.name,
    components: {
      best: bestShare * policy.bestWeight,
      recommended: recommendedShare * policy.recommendedWeight,
      downside: -downside * policy.negativeWeight,
      confidence,
      priorStrength: policy.priorStrength
    }
  };
}

export function explainRecommendation(input: {
  players: number;
  bestShare: number;
  recommendedShare: number;
  downside: number;
  positive: number;
  votes: number;
}) {
  const best = Math.round(input.bestShare * 100),
    negative = Math.round(input.downside * 100);
  let lead: string;
  if (input.bestShare >= 0.5 && input.downside < 0.1) lead = `Excellent at ${input.players}`;
  else if (input.positive >= 0.9 && input.downside < 0.1) lead = `Strong at ${input.players}`;
  else if (input.downside >= 0.15) lead = `Divisive at ${input.players}`;
  else lead = `Good fit at ${input.players}`;
  const sample =
    input.votes >= 80 ? "strong sample" : input.votes >= 25 ? "moderate sample" : "limited sample";
  return `${lead} — ${best}% call it Best, ${negative}% advise against it · ${input.votes} votes (${sample})`;
}

export function matchLocal(
  lines: string,
  games: { id: number; name: string; originalName?: string }[]
) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/https?:\/\/boardgamegeek\.com\/boardgame\/(\d+).*/, "$1")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return lines.split(/\r?\n/).map((raw) => {
    const value = normalize(raw);
    const exact = games.filter(
      (g) =>
        String(g.id) === value || [g.name, g.originalName ?? ""].some((n) => normalize(n) === value)
    );
    return {
      raw,
      status: exact.length === 1 ? "matched" : exact.length > 1 ? "ambiguous" : "unmatched",
      matches: exact
    };
  });
}
