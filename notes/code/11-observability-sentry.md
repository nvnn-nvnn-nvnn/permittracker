# 11 — Observability with Sentry (catching errors you can't see)

Phase: §5 launch prep. Pairs with the build entry in `01-phase-log.md`
(2026-06-03) and the two Sentry caveats in `00-decisions.md`.

> The earlier code notes dissect features *you* wrote. This one dissects a
> *third-party integration* — but the same shape applies: understand the
> pattern, read our real lines, know why each exists, and learn the gotchas
> that cost time.

---

## 1. The shape — what problem Sentry solves

A web request is supposed to be fast and then **vanish**: user clicks, server
queries the DB, returns HTML, the function instance disappears. That's great
for speed, terrible for *knowing what went wrong*. When a Stripe webhook throws
on a malformed event, or the OCR pipeline blows up on a weird PDF, that error
happens on a server with no screen, in a function that's already gone. Without
something watching, you find out when a customer emails "it's broken" — or you
never find out at all.

**Sentry is that watcher.** It's a hosted service that captures exceptions
(server *and* browser), groups them, and shows you a dashboard: the stack
trace, the route, how often, the context. Think of it as:

```
   your code throws
        │
        ▼
   Sentry SDK captures it ──► transmits to sentry.io ──► dashboard + alert
   (in your process)             (over HTTPS)              (you, debugging)
```

Three jobs, three layers in this repo:
- **Server** (`sentry.server.config.ts`) — API routes, server actions, tRPC,
  Inngest jobs. This is the one that matters most for a compliance product:
  a silent failure in reminders or billing *is* the "permit lapsed and we
  didn't warn them" scenario.
- **Edge** (`sentry.edge.config.ts`) — the auth middleware runs on Next's edge
  runtime; it needs its own init.
- **Client** (`instrumentation-client.ts`) — React errors in the browser.

A sibling tool, **PostHog**, answers a *different* question: not "what broke"
(Sentry) but "what did users do" (analytics). Don't conflate them.

---

## 2. Line by line — the server config

```ts
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./lib/observability/scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
```

- **`dsn`** — the "address" of your Sentry project (Data Source Name). It's
  embedded in the client bundle, so it is **public by design** — not a secret.
  It tells the SDK where to send events.
- **`enabled: !!process.env.SENTRY_DSN`** — DSN-gating. With no DSN (local dev
  without keys), the SDK becomes a **no-op** — nothing sends, nothing breaks.
  This is why a fresh clone builds without Sentry keys.
- **`tracesSampleRate: 0.1`** — performance tracing on 10% of requests. Errors
  are *always* captured regardless; this only samples the timing spans.
- **`sendDefaultPii: false`** — **the load-bearing line for this app.** It tells
  Sentry to withhold request bodies, cookies, headers, and user IP. Our brief
  says *never log permit/COI numbers or extracted document text*; this is the
  first wall.
- **`beforeSend: scrubEvent`** — a hook that runs on every event right before
  it leaves the process. Defense-in-depth on top of `sendDefaultPii: false`.

### How the three configs get loaded

```ts
// instrumentation.ts  (project root — a Next.js convention)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge")   await import("./sentry.edge.config");
}
export const onRequestError = Sentry.captureRequestError;
```

`register()` runs once at **server startup** and pulls in the right config for
the runtime. `onRequestError` is the App Router hook Next calls when a server
component or route handler throws — wiring it to `captureRequestError` is what
makes route errors auto-report. (The client config is loaded automatically by
Next from `instrumentation-client.ts`; it also exports
`onRouterTransitionStart` to trace client-side navigations.)

### The scrubber

```ts
// lib/observability/scrub.ts
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;          // request body
    delete event.request.query_string;  // ?secret=… and friends
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
  }
  if (event.extra) {
    for (const key of SENSITIVE_KEYS) delete event.extra[key]; // ocrText, permitNumber, …
  }
  return event;
}
```

Return the event to send it; return `null` to drop it entirely.

---

## 3. Why each piece exists — and how OCR data is *actually* kept safe

The honest mental model (this is the part worth internalizing): the scrubber is
**not** what primarily protects your document data. The real protection is
architectural:

1. **`sendDefaultPii: false`** — no bodies/cookies/headers attached. The main
   vector (an upload payload riding along with an error) is closed here.
2. **Sentry's Node SDK never captures local variable values** in stack frames.
   Your extracted permit number lives in a local (`a.identifier_number.value`)
   and in a DB row — neither is ever collected. This is the big one, and it's
   free.
3. **`scrubEvent`** — belt-and-suspenders: re-deletes the request body even if
   something tried to attach it, and strips known sensitive keys from
   `event.extra` (only relevant if code calls `Sentry.setExtra("ocrText", …)`).

**Two deliberate gaps** (documented in `00-decisions.md` so they're not a
surprise later):
- It does **not** scrub exception *message strings*. If you ever write
  ``throw new Error(`bad expiry: ${extractedText}`)`` that text reaches Sentry.
  The mitigation is **discipline**, not code: never interpolate document text
  or permit numbers into an `Error`. Current code is clean (`run.ts` only puts
  UUIDs in messages).
- It only sweeps `event.extra`, not `event.contexts` (we don't call
  `setContext` with sensitive data).

If those assumptions ever change, harden the scrubber (regex over messages +
a contexts sweep). For launch, the layered posture is defensible.

---

## 4. Build it yourself

Reproduce the capture-and-verify loop in any Next app:

1. `npm i @sentry/nextjs`, create a Sentry project, copy its DSN.
2. Add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` to `.env.local`.
3. Create the three `Sentry.init` files + `instrumentation.ts` (copy the shapes
   above). Wrap `next.config.ts` in `withSentryConfig`.
4. Add a throwaway route that **proves delivery without guessing**:
   ```ts
   export async function GET() {
     const eventId = Sentry.captureException(new Error("test"));
     const flushed = await Sentry.flush(3000);
     return Response.json({ eventId, flushed, dsnPresent: !!process.env.SENTRY_DSN });
   }
   ```
   `curl` it. `{eventId:"…", flushed:true, dsnPresent:true}` means the SDK
   captured *and* transmitted. If `eventId` is null → the SDK is disabled
   (no DSN / `enabled:false`). This three-field response collapses a confusing
   "nothing shows up" into a precise diagnosis. Delete the route after.

---

## 5. Gotchas (the ones that cost me time)

- **Events go to the project that owns the DSN — full stop.** `SENTRY_PROJECT`
  in your env only controls *source-map upload*, NOT where events land. I lost
  real time because an early DSN belonged to a stray `javascript-nextjs`
  project while my dashboard was open on `vendguard`. Events were arriving
  perfectly — into a project I wasn't looking at. **If "nothing shows up":
  first confirm the DSN's project == the dashboard view**, set environment to
  *All* and the date to *Last 24h*.
- **Ad-blockers silently eat client events.** uBlock / Brave Shields block
  requests to `*.ingest.sentry.io`. A browser test that "does nothing" may be
  blocked, not broken. **Test server-side to isolate** — the server sends
  directly, no browser in the path.
- **`instrumentation.ts` loads only at server startup.** Add it (or change any
  Sentry/env config) → **restart `npm run dev`**. Hot reload won't pick it up,
  and a stale server holds the old DSN.
- **`enabled: !!DSN` cuts both ways.** Forgot the DSN env var, or typo'd
  `NEXT_PUBLIC_DSN` instead of `NEXT_PUBLIC_SENTRY_DSN`? The SDK silently
  no-ops. No error, just nothing. (Both bit us during setup.)
- **The wizard (`npx @sentry/wizard`) won't add your PII scrubbing.** It
  scaffolds the files but generates a vanilla `Sentry.init` — recent versions
  even set `sendDefaultPii: true`. On a compliance app, treat
  `sendDefaultPii: false` + `beforeSend: scrubEvent` as **mandatory follow-up**
  after any wizard run.
- **`flush:true` is your friend in serverless.** Functions can exit before the
  SDK transmits. `await Sentry.flush(ms)` forces the queue to drain — and
  returns whether it succeeded, doubling as a delivery probe.

---

**See also:** `01-phase-log.md` (2026-06-03 build entry) · `00-decisions.md`
(Sentry PII posture + DSN-routing caveats) · `LAUNCH-CHECKLIST.md` §5.
