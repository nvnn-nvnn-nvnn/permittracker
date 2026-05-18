import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Stateless, signed acknowledge tokens for one-click reminder links.
 *
 * Format: base64url(payloadJSON) + "." + base64url(HMAC-SHA256(payload)).
 * Payload = { d: dispatchId, e: expiryEpochSeconds }. 14-day expiry (brief).
 * No DB lookup needed to validate authenticity — only to apply the effect.
 */
const TTL_SECONDS = 14 * 24 * 60 * 60;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sign(payload: string): string {
  return b64url(
    createHmac("sha256", requireEnv("REMINDER_TOKEN_SECRET"))
      .update(payload)
      .digest(),
  );
}

export function createAcknowledgeToken(dispatchId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = b64url(Buffer.from(JSON.stringify({ d: dispatchId, e: exp })));
  return `${payload}.${sign(payload)}`;
}

/** Returns the dispatchId if the token is authentic and unexpired, else null. */
export function verifyAcknowledgeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { d, e } = JSON.parse(fromB64url(payload).toString("utf8")) as {
      d: string;
      e: number;
    };
    if (typeof e !== "number" || Date.now() / 1000 > e) return null;
    return typeof d === "string" && d.length > 0 ? d : null;
  } catch {
    return null;
  }
}
