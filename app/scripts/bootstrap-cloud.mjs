import { readFile, writeFile } from "node:fs/promises";

const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "RESEND_API_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
const resendToken = process.env.RESEND_API_KEY;
const sendingDomain = "boardgames.planitnow.us";
const zoneName = "planitnow.us";

const cf = async (path, options = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${cloudflareToken}`, "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`Cloudflare ${path} failed: ${JSON.stringify(body.errors ?? body)}`);
  return body.result;
};

const resend = async (path, options = {}) => {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${resendToken}`, "Content-Type": "application/json", ...options.headers }
  });
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`Resend ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
};

const accounts = await cf("/accounts");
if (!accounts.some((account) => account.id === accountId)) {
  if (accounts.length !== 1) throw new Error("CLOUDFLARE_ACCOUNT_ID is not accessible and the token does not identify exactly one fallback account");
  accountId = accounts[0].id;
}

const databases = await cf(`/accounts/${accountId}/d1/database`);
let database = databases.find((candidate) => candidate.name === "boardgameengine");
if (!database) {
  database = await cf(`/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name: "boardgameengine" })
  });
}

const configPath = new URL("../wrangler.toml", import.meta.url);
const config = await readFile(configPath, "utf8");
await writeFile(configPath, config.replace("replace-after-running-wrangler-d1-create", database.uuid));

const domainList = await resend("/domains");
let domain = domainList.data.find((candidate) => candidate.name === sendingDomain);
if (!domain) {
  domain = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name: sendingDomain, region: "us-east-1", open_tracking: false, click_tracking: false })
  });
}
domain = await resend(`/domains/${domain.id}`);

const zones = await cf(`/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(accountId)}`);
if (zones.length !== 1) throw new Error(`Expected one Cloudflare zone for ${zoneName}, found ${zones.length}`);
const zoneId = zones[0].id;

for (const record of domain.records) {
  if (!["TXT", "MX", "CNAME"].includes(record.type)) continue;
  const name = record.name.endsWith(zoneName) ? record.name : `${record.name}.${sendingDomain}`;
  const content = record.value.replace(/^"|"$/g, "");
  const payload = {
    type: record.type,
    name,
    content,
    ttl: 1,
    ...(record.type === "MX" ? { priority: record.priority ?? 10 } : {}),
    ...(record.type === "CNAME" ? { proxied: false } : {})
  };
  const existing = await cf(`/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(name)}`);
  if (existing.length) {
    await cf(`/zones/${zoneId}/dns_records/${existing[0].id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(payload) });
  }
}

await resend(`/domains/${domain.id}/verify`, { method: "POST" });
console.log(`Cloudflare D1 and Resend DNS are configured; verification requested for ${sendingDomain}.`);
