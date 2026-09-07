export const LOGIN_TOKEN_MINUTES = 30;
const encoder = new TextEncoder();

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const data = crypto.getRandomValues(new Uint8Array(8));
  const characters = Array.from(data, (value) => alphabet[value % alphabet.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function expiresIn(minutes: number, now = new Date()): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

const DAY_MS = 86_400_000;
/** A session dies this long after it was last used. */
export const SESSION_IDLE_DAYS = 30;
/** A session dies this long after sign-in no matter how actively it is used. */
export const SESSION_ABSOLUTE_DAYS = 400;
/** Don't rewrite the session row on every single request. */
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000;

export type SessionUser = { id: string; email: string; role: string };

export function newSessionWindow(now = new Date()) {
  return {
    expiresAt: new Date(now.getTime() + SESSION_IDLE_DAYS * DAY_MS).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_DAYS * DAY_MS).toISOString()
  };
}

/** Slide the idle window forward, but never past the session's absolute deadline. */
export function nextSessionExpiry(absoluteExpiresAt: string | null, now = new Date()): string {
  const idle = new Date(now.getTime() + SESSION_IDLE_DAYS * DAY_MS).toISOString();
  return absoluteExpiresAt && absoluteExpiresAt < idle ? absoluteExpiresAt : idle;
}

/**
 * Resolve the signed-in user for a session cookie.
 *
 * Every authenticated surface — HTML pages and all three API routers — must go
 * through here. The disabled-account and expiry conditions previously lived in
 * four hand-copied SQL strings, and the copy guarding the HTML pages was missing
 * the disabled-account check entirely.
 */
export async function loadSessionUser(
  db: D1Database,
  token: string,
  now = new Date()
): Promise<SessionUser | null> {
  const tokenHash = await hash(token);
  const row = await db
    .prepare(
      "SELECT users.id,users.email,users.role,sessions.last_seen_at lastSeenAt,sessions.absolute_expires_at absoluteExpiresAt FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND users.disabled_at IS NULL AND sessions.expires_at>?"
    )
    .bind(tokenHash, now.toISOString())
    .first<SessionUser & { lastSeenAt: string | null; absoluteExpiresAt: string | null }>();
  if (!row) return null;
  const lastSeen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen >= SESSION_REFRESH_AFTER_MS)
    await db
      .prepare("UPDATE sessions SET last_seen_at=?,expires_at=? WHERE token_hash=?")
      .bind(now.toISOString(), nextSessionExpiry(row.absoluteExpiresAt, now), tokenHash)
      .run();
  return { id: row.id, email: row.email, role: row.role };
}
