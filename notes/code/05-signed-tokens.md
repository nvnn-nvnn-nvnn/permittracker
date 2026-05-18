# Code 05 — Signed tokens & the acknowledge flow (implementation)

Goal: read the actual crypto in `lib/reminders/token.ts` and how the
acknowledge link uses it. This is "prove a click is genuine without a login
or a database lookup."

Prereq: code note 01 (procedures), basic idea of hashing.

---

## 1. The shape (pattern: stateless capability)

You email someone a link. Clicking it must (a) identify *which* reminder and
(b) prove *we* issued it — with no session, and ideally no DB "valid tokens"
table. The pattern is a **signed token**:

```
token = base64url(payload) + "." + base64url( HMAC_SHA256(payload, SECRET) )
payload = { d: dispatchId, e: expiryEpoch }
```

Anyone can read the payload (it's not secret). Nobody can change it without
invalidating the signature, because they don't have `SECRET`. Validity is
pure math — no storage. (This is exactly how JWTs work under the hood;
we hand-rolled the minimal version.)

---

## 2. `token.ts` line by line

File: [`lib/reminders/token.ts`](../../lib/reminders/token.ts).

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

const TTL_SECONDS = 14 * 24 * 60 * 60;          // 14-day expiry (brief)
```

- `node:crypto` — Node's built-in crypto; no dependency needed.
- `requireEnv("REMINDER_TOKEN_SECRET")` (used below) — throws if the secret
  isn't set, instead of silently signing with `undefined`. Fail loud.

```ts
function b64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
```

- Standard base64 contains `+ / =` — illegal/awkward in URLs. **base64url**
  swaps them. This is an encoding, *not* encryption — it hides nothing.

```ts
function sign(payload: string): string {
  return b64url(
    createHmac("sha256", requireEnv("REMINDER_TOKEN_SECRET"))
      .update(payload).digest());
}
```

- **HMAC** = a keyed hash. `HMAC_SHA256(message, secret)` → a fixed
  fingerprint that can only be produced by someone who knows `secret`. Same
  message + same secret → same fingerprint, every time. Change one character
  of the message → completely different fingerprint.

```ts
export function createAcknowledgeToken(dispatchId: string): string {
  const exp = Math.floor(Date.now()/1000) + TTL_SECONDS;
  const payload = b64url(Buffer.from(JSON.stringify({ d: dispatchId, e: exp })));
  return `${payload}.${sign(payload)}`;
}
```

- Build `{ d: dispatchId, e: expiry }`, base64url it, append a dot and its
  HMAC. That string goes in the email URL: `…/acknowledge?token=<this>`.
- The expiry lives **inside the signed payload**, so it can't be extended by
  an attacker without breaking the signature.

```ts
export function verifyAcknowledgeToken(token: string): string | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const { d, e } = JSON.parse(fromB64url(payload).toString("utf8"));
  if (typeof e !== "number" || Date.now()/1000 > e) return null;
  return typeof d === "string" && d.length > 0 ? d : null;
}
```

Step by step — this is the whole security check:

1. Split into payload + mac. Malformed → `null`.
2. **Recompute** `sign(payload)` ourselves. If the sent mac ≠ our recomputed
   mac, the payload was tampered with (or forged without the secret) → reject.
3. **`timingSafeEqual`** instead of `===`: a normal string compare returns
   faster on an early-character mismatch. An attacker measuring those
   microsecond differences could brute-force a valid signature one character
   at a time (a "timing attack"). Constant-time compare removes the signal.
   (It needs equal-length buffers, hence the length check first.)
4. Only after the signature is proven do we read the payload and check the
   14-day expiry.
5. Return the `dispatchId` (authentic) or `null` (reject). **No DB touched
   here** — authenticity is pure crypto.

Return type `string | null` forces the caller to handle the reject case
(can't accidentally use a bad token as if it were good).

---

## 3. The endpoint that uses it

File:
[`app/api/reminders/acknowledge/route.ts`](../../app/api/reminders/acknowledge/route.ts).

```ts
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const dispatchId = token ? verifyAcknowledgeToken(token) : null;
  if (!dispatchId) return page("Link expired or invalid", …, false);

  const result = await acknowledgeDispatch(dispatchId);
  …
}
```

- A **Route Handler**, not a tRPC procedure — because it's an external link
  clicked from an inbox with no auth/session. (tRPC is for the typed
  in-app client; webhooks and email links are plain REST. Same split the
  brief uses for `/api/webhooks/*`.)
- `GET` with no login: the signed token *is* the authorization. That's the
  whole point of the pattern — the capability travels in the URL.
- Verify first; only a valid token yields a `dispatchId`; only then do we
  touch the DB.

`acknowledgeDispatch(dispatchId)` (in
[`lib/reminders/dispatch.ts`](../../lib/reminders/dispatch.ts)) sets
`acknowledgedAt = now`, and is **idempotent**: clicking twice returns
"already acknowledged" instead of erroring or double-writing.

This is where the brief's hard rule — *"never auto-acknowledge; only the
user"* — becomes structural: **nothing else in the codebase sets
`acknowledgedAt`.** The only path is a human clicking a link we cryptographically signed. The signature *is* the user's consent.

---

## 4. Build it yourself (exercise)

Prove the tamper-resistance by hand:

1. `node -e "require('ts-node')"` not needed — instead add a temporary script
   or a test: import `createAcknowledgeToken` / `verifyAcknowledgeToken`.
2. `const t = createAcknowledgeToken("abc")` → `verify` returns `"abc"`.
3. Flip one character in the **payload half** (before the dot) → `verify`
   returns `null` (signature no longer matches).
4. Flip a char in the **signature half** → also `null`.
5. Hand-craft `base64url({d:"victim",e:<far future>})` with **no** valid
   signature → `null`. You cannot forge one without `REMINDER_TOKEN_SECRET`.

That's the security property, demonstrated, in five lines.

---

## 5. Gotchas

- **Secret management:** if `REMINDER_TOKEN_SECRET` changes, every
  previously-emailed link stops verifying (different HMAC). Acceptable
  (links just get re-sent) — but don't rotate it casually. Different value
  per environment; never commit it (gitignored).
- **base64url ≠ encryption.** The payload is readable by anyone. Never put
  anything secret in it — only an id + expiry. Integrity, not confidentiality.
- **Always `timingSafeEqual` for secret/MAC comparisons**, never `===`.
  This is a real, exploited attack class, not paranoia.
- **Verify before you trust the payload.** Parse/expiry-check the JSON only
  *after* the signature passes — otherwise you're acting on attacker-
  controlled data.
- **Stateless is a feature:** no "tokens" table to grow, expire-sweep, or
  read on the hot path. The trade-off is you can't individually revoke one
  token without rotating the secret (fine here; a 14-day TTL bounds it).
