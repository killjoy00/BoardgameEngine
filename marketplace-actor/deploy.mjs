// One-shot, reviewed deployment to the user's private Apify account.
// GitHub Actions is used for *deployment only*, never as the runtime scheduler.
// Existing repository Actions secrets are transferred directly to encrypted
// Apify Actor env vars, not written to code, git commits, or job logs.
const root = "https://api.apify.com/v2";
const token = process.env.APIFY_API_TOKEN;
const needed = ["APIFY_API_TOKEN", "BGG_API_TOKEN", "RESEND_API_KEY", "MARKETPLACE_ALERT_TO"];
for (const key of needed) if (!process.env[key]) throw new Error("Deployment secret unavailable: " + key);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, { method = "GET", body, missingOk = false, timeoutMs = 80_000 } = {}) {
  const response = await fetch(root + path, {
    method,
    headers: { Authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status === 404 && missingOk) return null;
  if (!response.ok) {
    // Deliberately do not log response payloads; APIs may echo secret inputs.
    throw new Error("Apify deployment " + method + " " + path.split("?")[0] +
      " failed with HTTP " + response.status);
  }
  if (response.status === 204) return null;
  const content = await response.json();
  return content.data;
}
async function run(actorId, input, label) {
  const actor = encodeURIComponent(actorId);
  const state = await request("/actors/" + actor +
    "/runs?build=latest&timeoutSecs=1200&memoryMbytes=512", {
    method: "POST", body: input
  });
  if (!state?.id) throw new Error(label + " was not started");
  let item = state;
  for (let attempt = 0; attempt < 48; attempt++) {
    if (["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(item.status)) break;
    await sleep(15_000);
    item = await request("/actor-runs/" + encodeURIComponent(state.id));
  }
  console.log(label, "Actor run id:", state.id, "status:", item.status);
  if (item.status !== "SUCCEEDED") throw new Error(label + " failed; no schedule enabled");
  return item;
}
async function upsertSchedule(name, id, cron, mode) {
  const all = await request("/schedules?limit=100");
  const existing = all?.items?.find((x) => x.name === name);
  const payload = {
    name,
    title: mode === "scan" ? "BGG + Xbox Marketplace every four hours" :
      "BGG Marketplace missed-scan watchdog",
    description: mode === "scan"
      ? "Apify owns the full BGG wishlist/Marketplace search, matching and Resend email cycle. No GitHub cron."
      : "Checks Apify stored completion heartbeat hourly; emails only if full scans are over six hours late.",
    cronExpression: cron,
    timezone: "America/Chicago",
    isEnabled: true,
    isExclusive: true,
    actions: [{
      type: "RUN_ACTOR",
      actorId: id,
      runInput: { body: JSON.stringify({ mode }),
        contentType: "application/json; charset=utf-8" },
      runOptions: { build: "latest", timeoutSecs: 1200, memoryMbytes: 512,
        restartOnError: false }
    }]
  };
  const record = existing
    ? await request("/schedules/" + encodeURIComponent(existing.id),
      { method: "PUT", body: payload })
    : await request("/schedules", { method: "POST", body: payload });
  if (!record?.id) throw new Error("Schedule upsert did not return an ID");
  console.log("Enabled Apify schedule:", name, "id:", record.id,
    "next:", record.nextRunAt || "not yet available");
}

async function main() {
  const who = await request("/users/me");
  const username = who?.username;
  if (!username) throw new Error("Apify token did not identify an account");
  const actorName = "bgg-marketplace-managed-monitor";
  const qualified = username + "~" + actorName;
  const gitRepoUrl = "https://github.com/killjoy00/BoardgameEngine.git#main:marketplace-actor";
  const version = {
    versionNumber: "0.0",
    sourceType: "GIT_REPO",
    gitRepoUrl,
    buildTag: "latest",
    applyEnvVarsToBuild: false,
    envVars: [
      { name: "BGG_API_TOKEN", value: process.env.BGG_API_TOKEN, isSecret: true },
      { name: "RESEND_API_KEY", value: process.env.RESEND_API_KEY, isSecret: true },
      { name: "MARKETPLACE_ALERT_TO", value: process.env.MARKETPLACE_ALERT_TO, isSecret: true }
    ]
  };
  const existing = await request("/actors/" + encodeURIComponent(qualified),
    { missingOk: true });
  const actor = existing || await request("/actors", {
    method: "POST", body: {
      name: actorName,
      title: "Private BGG wishlist Marketplace email monitor",
      description: "Scheduled personal BGG/Xbox Marketplace matching and Resend email",
      isPublic: false,
      versions: [version]
    }
  });
  if (!actor?.id) throw new Error("Private Actor was not created");
  if (existing) {
    await request("/actors/" + encodeURIComponent(actor.id) + "/versions/0.0",
      { method: "PUT", body: version });
  }
  console.log("Private Apify Actor id:", actor.id,
    "source:", "BoardgameEngine.git#main:marketplace-actor");
  let build = await request("/actors/" + encodeURIComponent(actor.id) +
    "/builds?version=0.0&tag=latest&waitForFinish=60",
    { method: "POST", timeoutMs: 80_000 });
  if (!build?.id) throw new Error("Actor build did not start");
  for (let i = 0; i < 10 &&
      !["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(build.status); i++) {
    build = await request("/actor-builds/" + encodeURIComponent(build.id) +
      "?waitForFinish=60", { timeoutMs: 80_000 });
  }
  console.log("Actor build:", build.id, "status:", build.status);
  if (build.status !== "SUCCEEDED") throw new Error("Actor build failed; do not schedule");

  await run(actor.id, { mode: "check" }, "Credential and saved-task preflight");
  await run(actor.id, { mode: "scan" }, "First real Marketplace baseline scan");
  // Only enable scheduled work after the complete first scan and state save.
  await upsertSchedule("bgg-marketplace-owned-scan-every4h", actor.id,
    "37 */4 * * *", "scan");
  await upsertSchedule("bgg-marketplace-overdue-watchdog-hourly", actor.id,
    "47 * * * *", "watchdog");
  console.log("Independent Apify monitoring enabled. Retire the old GitHub cron after verification.");
}
main().catch((error) => {
  console.error("APIFY_DEPLOY_FAILED:", error?.message || String(error));
  process.exitCode = 1;
});
