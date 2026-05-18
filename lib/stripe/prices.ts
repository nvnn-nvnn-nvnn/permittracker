import "server-only";
import { getStripe } from "./client";

/**
 * Resolve a Stripe price id from its stable `lookup_key`, cached in-process.
 * Lets the app reference plans by meaning ("permitkeep_pro_month") instead
 * of brittle price IDs.
 */
const cache = new Map<string, string>();

export async function resolvePriceId(lookupKey: string): Promise<string> {
  const hit = cache.get(lookupKey);
  if (hit) return hit;

  const stripe = getStripe();
  const res = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const price = res.data[0];
  if (!price) {
    throw new Error(
      `No active Stripe price for lookup_key "${lookupKey}". Run \`npm run stripe:setup\`.`,
    );
  }
  cache.set(lookupKey, price.id);
  return price.id;
}
