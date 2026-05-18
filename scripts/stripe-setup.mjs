// Idempotent Stripe product/price setup.
//   npm run stripe:setup
// Safe to run repeatedly: products are matched by metadata, prices by
// lookup_key. Mirrors the catalog in lib/stripe/index.ts — keep in sync.
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: ".env.local" });
config({ path: ".env" });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY not set in .env.local — aborting.");
  process.exit(1);
}
const stripe = new Stripe(key);

// Mirror of PLANS in lib/stripe/index.ts (USD).
const PLANS = {
  starter: { label: "Starter", monthlyUsd: 19, yearlyUsd: 190 },
  pro: { label: "Pro", monthlyUsd: 49, yearlyUsd: 490 },
  fleet: { label: "Fleet", monthlyUsd: 129, yearlyUsd: 1290 },
};
const CONCIERGE_USD = 49;

async function findProduct(tag) {
  const all = await stripe.products.list({ limit: 100, active: true });
  return all.data.find(
    (p) => p.metadata?.app === "permitkeep" && p.metadata?.tag === tag,
  );
}
async function ensureProduct(tag, name) {
  const existing = await findProduct(tag);
  if (existing) return existing;
  return stripe.products.create({
    name,
    metadata: { app: "permitkeep", tag },
  });
}
async function ensurePrice(productId, lookupKey, amountUsd, recurring) {
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
  });
  if (found.data[0]) {
    console.log(`  = ${lookupKey} (exists: ${found.data[0].id})`);
    return found.data[0];
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: Math.round(amountUsd * 100),
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    ...(recurring ? { recurring: { interval: recurring } } : {}),
  });
  console.log(`  + ${lookupKey} -> ${price.id}`);
  return price;
}

async function main() {
  for (const [tier, p] of Object.entries(PLANS)) {
    console.log(`PermitKeep ${p.label}:`);
    const product = await ensureProduct(tier, `PermitKeep ${p.label}`);
    await ensurePrice(
      product.id,
      `permitkeep_${tier}_month`,
      p.monthlyUsd,
      "month",
    );
    await ensurePrice(
      product.id,
      `permitkeep_${tier}_year`,
      p.yearlyUsd,
      "year",
    );
  }
  console.log("PermitKeep Concierge Onboarding:");
  const concierge = await ensureProduct(
    "concierge",
    "PermitKeep Concierge Onboarding",
  );
  await ensurePrice(
    concierge.id,
    "permitkeep_concierge_onetime",
    CONCIERGE_USD,
    null,
  );
  console.log("\nDone. Prices are resolved at runtime by lookup_key.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
