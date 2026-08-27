import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { expiresIn, hash, isEmail, LOGIN_TOKEN_MINUTES, normalizeEmail, randomCode, randomToken } from "./auth";
import { sendSignInEmail } from "./email";

type Bindings = { DB: D1Database; EMAIL_FROM: string; RESEND_API_KEY: string };
type User = { id: string; email: string };
type AppContext = Context<{ Bindings: Bindings }>;
const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (context) => context.json({ ok: true }));

app.post("/auth/request", async (context) => {
  const body = await context.req.parseBody();
  const email = normalizeEmail(String(body.email ?? ""));
  const neutral = { message: "If that address is invited, a sign-in email is on its way." };
  if (!isEmail(email)) return context.json(neutral, 202);
  const user = await context.env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<User>();
  if (!user) return context.json(neutral, 202);

  const token = randomToken();
  const code = randomCode();
  await context.env.DB.prepare("INSERT INTO login_tokens (id, user_id, token_hash, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, await hash(token), await hash(code), expiresIn(LOGIN_TOKEN_MINUTES)).run();
  const url = `${new URL(context.req.url).origin}/auth/confirm?token=${encodeURIComponent(token)}`;
  await sendSignInEmail({ apiKey: context.env.RESEND_API_KEY, from: context.env.EMAIL_FROM, to: user.email, url, code });
  return context.json(neutral, 202);
});

app.get("/auth/confirm", (context) => {
  const token = context.req.query("token") ?? "";
  return context.html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Confirm sign-in</title><body><main><h1>Confirm sign-in</h1><p>This link has not been consumed.</p><form method="post" action="/auth/confirm"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Continue signing in</button></form></main></body></html>`);
});

app.post("/auth/confirm", async (context) => {
  const body = await context.req.parseBody();
  return consumeToken(context, "token_hash", await hash(String(body.token ?? "")));
});

app.post("/auth/code", async (context) => {
  const body = await context.req.parseBody();
  const email = normalizeEmail(String(body.email ?? ""));
  const user = await context.env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<User>();
  if (!user) return context.json({ error: "The code is invalid or expired." }, 400);
  return consumeToken(context, "code_hash", await hash(String(body.code ?? "").trim().toUpperCase()), user.id);
});

app.get("/api/session", async (context) => {
  const raw = getCookie(context, "bge_session");
  if (!raw) return context.json({ authenticated: false }, 401);
  const sessionHash = await hash(raw);
  const session = await context.env.DB.prepare("SELECT users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?")
    .bind(sessionHash).first();
  if (!session) return context.json({ authenticated: false }, 401);
  await context.env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
    .bind(new Date().toISOString(), sessionHash).run();
  setSessionCookie(context, raw);
  return context.json({ authenticated: true, user: session });
});

app.post("/auth/logout", async (context) => {
  const raw = getCookie(context, "bge_session");
  if (raw) await context.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash(raw)).run();
  setCookie(context, "bge_session", "", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 0 });
  return context.redirect("/");
});

async function consumeToken(context: AppContext, column: "token_hash" | "code_hash", value: string, userId?: string) {
  const condition = userId ? " AND user_id = ?" : "";
  const args = userId ? [value, new Date().toISOString(), userId] : [value, new Date().toISOString()];
  const record = await context.env.DB.prepare(`SELECT id, user_id FROM login_tokens WHERE ${column} = ? AND consumed_at IS NULL AND expires_at > ?${condition} ORDER BY created_at DESC LIMIT 1`)
    .bind(...args).first<{ id: string; user_id: string }>();
  if (!record) return context.json({ error: "The sign-in request is invalid or expired." }, 400);
  const consumed = await context.env.DB.prepare("UPDATE login_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(new Date().toISOString(), record.id).run();
  if (!consumed.meta.changes) return context.json({ error: "The sign-in request has already been used." }, 400);

  const session = randomToken();
  await context.env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), record.user_id, await hash(session)).run();
  setSessionCookie(context, session);
  return context.redirect("/app");
}

export default app;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function setSessionCookie(context: AppContext, session: string): void {
  // Browsers commonly cap persistent cookies near 400 days. Refreshing it on
  // authenticated use keeps active users signed in until they explicitly leave.
  setCookie(context, "bge_session", session, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
}
