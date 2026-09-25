/**
 * Minimal single-user session: an HMAC-signed cookie.
 * Uses Web Crypto so the same code runs in middleware (edge) and route handlers (node).
 */

const COOKIE_NAME = "lc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    throw new Error("APP_SECRET is missing or too short. Set it in .env (see .env.example).");
  }
  return s;
}

export async function createSessionToken() {
  const payload = JSON.stringify({ u: "owner", exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const data = b64url(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await key(secret()), new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return false;
  const [data, sig] = token.split(".");
  if (!data || !sig) return false;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret()),
      fromB64url(sig),
      new TextEncoder().encode(data),
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(data))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Constant-time-ish string compare, good enough for a single local password. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
