import { appendFile, readFile, writeFile } from "node:fs/promises";

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");

const get = async (path) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`Cloudflare request failed: ${JSON.stringify(body.errors ?? body)}`);
  return body.result;
};

const accounts = await get("/accounts");
const configured = process.env.CLOUDFLARE_ACCOUNT_ID;
const account = accounts.find((item) => item.id === configured) ?? (accounts.length === 1 ? accounts[0] : null);
if (!account) throw new Error("The token must provide exactly one account when the configured account ID is unavailable");
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `CLOUDFLARE_ACCOUNT_ID=${account.id}\n`);
const databases = await get(`/accounts/${account.id}/d1/database`);
const database = databases.find((item) => item.name === "boardgameengine");
if (!database) throw new Error("The boardgameengine D1 database was not found");

const configUrl = new URL("../wrangler.toml", import.meta.url);
const config = await readFile(configUrl, "utf8");
await writeFile(configUrl, config.replace("replace-after-running-wrangler-d1-create", database.uuid));
console.log("Resolved the boardgameengine D1 database.");
