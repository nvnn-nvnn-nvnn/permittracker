import { describe, it, expect, beforeAll } from "vitest";
import Stripe from "stripe";

/**
 * Signature-verification tests for the Stripe webhook endpoint.
 *
 * These exercise ONLY the `constructEvent` gate in route.ts — we use an
 * unhandled event type so the handler falls through to the `default` branch
 * and returns 200 without ever touching the DB or Stripe's API. That keeps the
 * test offline and hermetic: `generateTestHeaderString` is a pure local HMAC.
 */

const WEBHOOK_SECRET = "whsec_test_secret_for_signing";
const STRIPE_KEY = "sk_test_dummy"; // never used for a network call here

// Set before any code calls serverEnv()/getStripe() (both memoize lazily).
beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

// Import the route *after* env is set so the lazy clients pick up our keys.
async function getPOST() {
  const mod = await import("./route");
  return mod.POST;
}

// An event type the handler doesn't act on → `default` → 200, no DB/API.
const eventBody = JSON.stringify({
  id: "evt_test",
  object: "event",
  type: "invoice.payment_succeeded",
  data: { object: {} },
});

function sign(payload: string, secret = WEBHOOK_SECRET): string {
  const stripe = new Stripe(STRIPE_KEY);
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function makeRequest(body: string, sig?: string): Request {
  const headers = new Headers();
  if (sig !== undefined) headers.set("stripe-signature", sig);
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

describe("stripe webhook signature verification", () => {
  it("accepts a correctly signed payload (200)", async () => {
    const POST = await getPOST();
    const res = await POST(makeRequest(eventBody, sign(eventBody)));
    expect(res.status).toBe(200);
  });

  it("rejects a request with no stripe-signature header (400)", async () => {
    const POST = await getPOST();
    const res = await POST(makeRequest(eventBody));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing signature");
  });

  it("rejects a malformed signature header (400)", async () => {
    const POST = await getPOST();
    const res = await POST(makeRequest(eventBody, "not-a-real-signature"));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/signature verification failed/i);
  });

  it("rejects a valid signature over a different payload — tampered body (400)", async () => {
    const POST = await getPOST();
    const sig = sign(eventBody); // signs the original body…
    const tampered = eventBody.replace("evt_test", "evt_tampered");
    const res = await POST(makeRequest(tampered, sig)); // …but we send another
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/signature verification failed/i);
  });

  it("rejects a payload signed with the wrong secret (400)", async () => {
    const POST = await getPOST();
    const sig = sign(eventBody, "whsec_some_other_secret");
    const res = await POST(makeRequest(eventBody, sig));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/signature verification failed/i);
  });

  it("rejects an expired timestamp outside the tolerance window (400)", async () => {
    const POST = await getPOST();
    // Sign with a timestamp ~1 hour in the past; default tolerance is 5 min.
    const stale = Math.floor(Date.now() / 1000) - 60 * 60;
    const stripe = new Stripe(STRIPE_KEY);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: eventBody,
      secret: WEBHOOK_SECRET,
      timestamp: stale,
    });
    const res = await POST(makeRequest(eventBody, sig));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/signature verification failed/i);
  });
});
