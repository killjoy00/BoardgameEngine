export const LOGIN_TOKEN_MINUTES = 30;
const encoder = new TextEncoder();

export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function isEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  data.forEach((byte) => { binary += String.fromCharCode(byte); });
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
