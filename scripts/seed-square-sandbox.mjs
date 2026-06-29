/**
 * Seed real sandbox sales into a connected Square account, so you can test the
 * live ingest end-to-end (Sync → P&L + inventory depletion).
 *
 *   node scripts/seed-square-sandbox.mjs [accountSelector] [--orders N]
 *
 * - accountSelector: "admin" (default), an email, or an account slug/name.
 * - --orders N: how many paid orders to create (default 14).
 *
 * Creating orders/payments needs WRITE scopes. The app's OAuth token is
 * intentionally read-only (we never write to Square), so this script uses a
 * separate write-capable token — your app's **Sandbox Access Token** from the
 * Square Developer dashboard. Provide it via env or flag:
 *     SQUARE_SEED_ACCESS_TOKEN=EAAA...   (in .env.local), or
 *     --token=EAAA...
 *
 * It resolves a REAL location from the Square API, checks it's the same
 * merchant your app connected to (so the read-only sync will see the orders),
 * creates orders with line-item names matching your seeded recipes, then pays
 * each with the sandbox test card so the order CLOSES — our sync only reads
 * COMPLETED orders.
 *
 * NOTE: Square sets `closed_at` to "now", so all sales land on today's date.
 * That's expected for a sandbox smoke test.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });
config({ path: ".env" });

// ---- args ----
const args = process.argv.slice(2);
const selector = args.find((a) => !a.startsWith("--")) ?? "admin";
const orderCount = Number(
  (args.find((a) => a.startsWith("--orders")) ?? "").split("=")[1] ??
    args[args.indexOf("--orders") + 1] ??
    14,
);

const SQUARE_VERSION = "2025-01-23";
const rootUrl = (env) =>
  env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

// Menu prices (cents). Names match the seeded recipes (stub menu) so that,
// once the location is mapped to that truck, inventory depletion ties out.
const PRICE_HINTS = {
  "smash burger": 1100,
  "loaded fries": 700,
  "chicken tacos (3)": 1000,
  "veggie wrap": 900,
  "fountain soda": 300,
};

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function squareFetch(token, env, path, body) {
  const res = await fetch(`${rootUrl(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${path} ${res.status}: ${JSON.stringify(json.errors ?? json)}`,
    );
  }
  return json;
}

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

async function main() {
  // 1. Resolve account.
  let account;
  if (selector === "admin") {
    [account] = await sql`
      select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id
      where u.is_platform_admin = true order by a.created_at limit 1`;
  } else if (selector.includes("@")) {
    [account] = await sql`
      select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id
      where lower(u.email) = ${selector.toLowerCase()} limit 1`;
  } else {
    [account] = await sql`
      select id, name from account where lower(name) = ${selector.toLowerCase()} limit 1`;
  }
  if (!account) {
    console.error(`No account matched "${selector}".`);
    process.exit(1);
  }
  console.log(`Account: ${account.name} (${account.id})`);

  // 2. Write-capable seeding token (NOT the read-only OAuth token).
  const tokenArg = (args.find((a) => a.startsWith("--token")) ?? "").split("=")[1];
  const token = tokenArg || process.env.SQUARE_SEED_ACCESS_TOKEN;
  const env =
    (process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox");
  if (!token) {
    console.error(
      [
        "Missing a write-capable Square token.",
        "Get your app's Sandbox Access Token from the Square Developer dashboard",
        "(your app → Sandbox → Credentials/'Sandbox Access token', starts with EAAA…),",
        "then either add it to .env.local as SQUARE_SEED_ACCESS_TOKEN=… or pass --token=…",
      ].join("\n"),
    );
    process.exit(1);
  }
  if (env === "production") {
    console.error("Refusing to create orders against PRODUCTION. Set SQUARE_ENVIRONMENT=sandbox.");
    process.exit(1);
  }

  // 3. Resolve a REAL active location from Square (and its merchant).
  const locRes = await fetch(`${rootUrl(env)}/v2/locations`, {
    headers: { Authorization: `Bearer ${token}`, "Square-Version": SQUARE_VERSION },
  });
  const locJson = await locRes.json();
  if (!locRes.ok) {
    console.error(`/v2/locations ${locRes.status}: ${JSON.stringify(locJson.errors ?? locJson)}`);
    process.exit(1);
  }
  const active = (locJson.locations ?? []).find((l) => l.status !== "INACTIVE");
  if (!active) {
    console.error("No active Square location on the seeding token's account.");
    process.exit(1);
  }
  const locationId = active.id;
  const seedMerchant = active.merchant_id;
  console.log(`Seeding into location ${locationId} ("${active.name}"), merchant ${seedMerchant}.`);

  // Warn if the seeding account differs from the one the app connected to —
  // the read-only sync reads via the OAuth merchant, so they must match.
  const [oauth] = await sql`
    select merchant_id from square_oauth where account_id = ${account.id} limit 1`;
  if (oauth && oauth.merchant_id && oauth.merchant_id !== seedMerchant) {
    console.warn(
      `\n⚠  Your app connected merchant ${oauth.merchant_id}, but this token is merchant ${seedMerchant}.\n` +
        `   The sync won't see these orders. Use the Sandbox Access Token for the SAME test account you connected.\n`,
    );
  }

  // 4. Menu — names that match the seeded recipes (stub menu). After running,
  //    map this location to that truck in Operations → Square so depletion ties
  //    out.
  const menu = Object.entries(PRICE_HINTS).map(([name, priceCents]) => ({
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    priceCents,
  }));
  console.log(`Menu (${menu.length}): ${menu.map((m) => m.name).join(", ")}`);

  // 5. Create + pay orders.
  let created = 0;
  let grossCents = 0;
  for (let i = 0; i < orderCount; i++) {
    const items = pick(menu, 1 + Math.floor(Math.random() * 3)).map((m) => ({
      name: m.name,
      quantity: String(1 + Math.floor(Math.random() * 2)),
      base_price_money: { amount: m.priceCents, currency: "USD" },
    }));

    const orderRes = await squareFetch(token, env, "/v2/orders", {
      idempotency_key: randomUUID(),
      order: { location_id: locationId, line_items: items },
    });
    const order = orderRes.order;
    const total = order.total_money?.amount ?? 0;
    if (!total) continue;

    await squareFetch(token, env, "/v2/payments", {
      idempotency_key: randomUUID(),
      source_id: "cnon:card-nonce-ok",
      amount_money: { amount: total, currency: "USD" },
      order_id: order.id,
      location_id: locationId,
      autocomplete: true,
    });
    created++;
    grossCents += total;
    process.stdout.write(`\r  created ${created}/${orderCount} orders…`);
  }
  console.log(
    `\nDone. ${created} paid orders, ~$${(grossCents / 100).toFixed(2)} gross (all dated today).`,
  );
  console.log('Now hit "Sync now" in Operations to pull them in.');

  await sql.end();
}

main().catch(async (e) => {
  console.error("\nFailed:", e.message);
  await sql.end();
  process.exit(1);
});
