/**
 * Seed placeholder operations data — inventory (ingredients), recipes, and
 * expenses — for the first account's active trucks. Per-truck (Option B):
 * ingredients/recipes are created per truck; recipe names match the Square
 * demo menu so auto-depletion matches on sync.
 *
 * Idempotent: re-running deletes the prior seeded rows (by name/description)
 * first, so it won't pile up duplicates.
 *
 * Usage:  node scripts/seed-ops.mjs [selector]
 *   selector (optional) picks the account:
 *     • "admin"            → the account owned/used by a platform admin
 *     • an email           → that user's account
 *     • a slug or name     → matched account
 *     • (omitted)          → the first account
 *   npm run seed:ops -- admin
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url || url.includes("placeholder")) {
  console.error("✗ DATABASE_URL is not set in .env.local — can't seed.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

// --- Placeholder catalog (matches the Square stub menu names) -------------

const INGREDIENTS = [
  { name: "Brioche buns", category: "Bakery", unit: "each", cost: 45, onHand: 80, par: 50, supplier: "US Foods" },
  { name: "Beef patty", category: "Protein", unit: "each", cost: 110, onHand: 60, par: 40, supplier: "Restaurant Depot" },
  { name: "Cheddar slice", category: "Dairy", unit: "each", cost: 25, onHand: 120, par: 60, supplier: "US Foods" },
  { name: "Lettuce", category: "Produce", unit: "lb", cost: 200, onHand: 8, par: 5, supplier: "Local Market" },
  { name: "Frozen fries", category: "Frozen", unit: "lb", cost: 120, onHand: 40, par: 20, supplier: "Restaurant Depot" },
  { name: "Soda syrup", category: "Beverage", unit: "gal", cost: 1800, onHand: 3, par: 2, supplier: "Coca-Cola" },
  { name: "Tortillas", category: "Bakery", unit: "each", cost: 18, onHand: 90, par: 50, supplier: "US Foods" },
  { name: "Chicken thigh", category: "Protein", unit: "lb", cost: 320, onHand: 18, par: 12, supplier: "Restaurant Depot" },
];

// recipe name -> { price (cents), lines: [ingredient name, qty] }
const RECIPES = {
  "Smash burger": { price: 1100, lines: [["Brioche buns", 1], ["Beef patty", 2], ["Cheddar slice", 2], ["Lettuce", 0.1]] },
  "Loaded fries": { price: 700, lines: [["Frozen fries", 0.5], ["Cheddar slice", 1]] },
  "Chicken tacos (3)": { price: 1000, lines: [["Tortillas", 3], ["Chicken thigh", 0.4], ["Lettuce", 0.1]] },
  "Fountain soda": { price: 300, lines: [["Soda syrup", 0.02]] },
};

const TRUCK_EXPENSES = [
  { description: "Truck insurance", category: "Insurance", amount: 24000, daysAgo: 3, vendor: "State Farm" },
  { description: "Propane refill", category: "Fuel", amount: 8500, daysAgo: 6, vendor: "AmeriGas" },
  { description: "Generator service", category: "Repairs", amount: 14000, daysAgo: 12, vendor: "Joe's Mobile Repair" },
];

const BUSINESS_EXPENSES = [
  { description: "Commissary rent", category: "Commissary", amount: 60000, daysAgo: 5, vendor: "Twin Cities Commissary" },
  { description: "Workers' comp insurance", category: "Insurance", amount: 18000, daysAgo: 9, vendor: "The Hartford" },
  { description: "Instagram ads", category: "Marketing", amount: 7500, daysAgo: 2, vendor: "Meta" },
];

function dateDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function resolveAccount(selector) {
  if (!selector) {
    const [a] = await sql`select id, name from account order by created_at asc limit 1`;
    return a;
  }
  if (selector.toLowerCase() === "admin") {
    const [byOwner] = await sql`
      select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id
      where u.is_platform_admin = true
      order by a.created_at asc limit 1`;
    if (byOwner) return byOwner;
    const [byMember] = await sql`
      select a.id, a.name from account a
      join membership m on m.account_id = a.id
      join app_user u on u.id = m.user_id
      where u.is_platform_admin = true
      order by a.created_at asc limit 1`;
    return byMember;
  }
  // Try email (owner or member), slug, or name fragment.
  const [byEmail] = await sql`
    select a.id, a.name from account a
    join membership m on m.account_id = a.id
    join app_user u on u.id = m.user_id
    where lower(u.email) = lower(${selector})
    order by a.created_at asc limit 1`;
  if (byEmail) return byEmail;
  const [byAccount] = await sql`
    select id, name from account
    where slug = ${selector} or name ilike ${"%" + selector + "%"}
    order by created_at asc limit 1`;
  return byAccount;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const selector = args.find((a) => !a.startsWith("--"));
  const account = await resolveAccount(selector);
  if (!account) {
    console.error(
      selector
        ? `✗ No account matched "${selector}".`
        : "✗ No account found. Sign up in the app first, then re-run.",
    );
    const all = await sql`
      select a.name, a.slug, u.email, u.is_platform_admin
      from account a left join app_user u on u.id = a.owner_user_id
      order by a.created_at asc`;
    if (all.length) {
      console.error("  Available accounts:");
      for (const a of all)
        console.error(
          `   - ${a.name} (slug: ${a.slug}, owner: ${a.email ?? "—"}${a.is_platform_admin ? ", admin" : ""})`,
        );
    }
    return;
  }
  console.log(`• Account: ${account.name} (${account.id})`);

  if (reset) {
    // Full ops wipe (FKs cascade to child rows) so a reseed is duplicate-free.
    await sql`delete from ingredient where account_id = ${account.id}`;
    await sql`delete from recipe where account_id = ${account.id}`;
    await sql`delete from purchase_order where account_id = ${account.id}`;
    await sql`delete from inventory_count where account_id = ${account.id}`;
    await sql`delete from inventory_usage where account_id = ${account.id}`;
    await sql`delete from expense where account_id = ${account.id}`;
    await sql`delete from sales_item_day where account_id = ${account.id}`;
    await sql`delete from sales_day where account_id = ${account.id}`;
    console.log("• --reset: cleared all ops data for this account");
  }

  let trucks = await sql`
    select id, name from truck
    where account_id = ${account.id} and archived_at is null
    order by created_at asc
  `;
  if (trucks.length === 0) {
    const id = randomUUID();
    await sql`
      insert into truck (id, account_id, name, jurisdiction, is_active)
      values (${id}, ${account.id}, ${"Demo Truck"}, ${"Minneapolis, MN"}, true)
    `;
    trucks = [{ id, name: "Demo Truck" }];
    console.log("• Created Demo Truck (no trucks existed)");
  }

  for (const truck of trucks) {
    const ingNames = INGREDIENTS.map((i) => i.name);
    const recNames = Object.keys(RECIPES);

    // Idempotent: clear prior seeded rows for this truck (FKs cascade).
    await sql`delete from recipe where account_id = ${account.id} and truck_id = ${truck.id} and name in ${sql(recNames)}`;
    await sql`delete from ingredient where account_id = ${account.id} and truck_id = ${truck.id} and name in ${sql(ingNames)}`;

    // Ingredients (explicit ids so recipes can reference them).
    const ingId = {};
    const ingredientRows = INGREDIENTS.map((i) => {
      const id = randomUUID();
      ingId[i.name] = id;
      return {
        id,
        account_id: account.id,
        truck_id: truck.id,
        name: i.name,
        category: i.category,
        unit: i.unit,
        unit_cost_cents: i.cost,
        on_hand_qty: i.onHand,
        par_level: i.par,
        reorder_to_qty: i.par * 2,
        supplier_name: i.supplier,
      };
    });
    await sql`insert into ingredient ${sql(ingredientRows)}`;

    // Recipes + their ingredient lines.
    for (const [name, r] of Object.entries(RECIPES)) {
      const recipeId = randomUUID();
      await sql`
        insert into recipe (id, account_id, truck_id, name, category, sell_price_cents)
        values (${recipeId}, ${account.id}, ${truck.id}, ${name}, ${"Menu"}, ${r.price})
      `;
      const lineRows = r.lines.map(([ingName, qty]) => ({
        id: randomUUID(),
        account_id: account.id,
        recipe_id: recipeId,
        ingredient_id: ingId[ingName],
        qty,
      }));
      await sql`insert into recipe_ingredient ${sql(lineRows)}`;
    }

    // A received purchase order (populates P&L food cost + per-truck spend).
    await sql`delete from purchase_order where account_id = ${account.id} and truck_id = ${truck.id} and notes = ${"[seed] restock"}`;
    const poId = randomUUID();
    await sql`
      insert into purchase_order
        (id, account_id, truck_id, supplier_name, status, notes, ordered_at, received_at)
      values
        (${poId}, ${account.id}, ${truck.id}, ${"Restaurant Depot"}, ${"received"}, ${"[seed] restock"}, ${dateDaysAgo(8)}, ${dateDaysAgo(7)})
    `;
    const poLines = [
      ["Beef patty", 40, 110],
      ["Brioche buns", 50, 45],
      ["Frozen fries", 25, 120],
      ["Chicken thigh", 12, 320],
    ].map(([n, qty, cost]) => ({
      id: randomUUID(),
      account_id: account.id,
      purchase_order_id: poId,
      ingredient_id: ingId[n],
      qty,
      unit_cost_cents: cost,
    }));
    await sql`insert into purchase_order_item ${sql(poLines)}`;

    // Truck-tagged expenses.
    await sql`delete from expense where account_id = ${account.id} and truck_id = ${truck.id} and description in ${sql(TRUCK_EXPENSES.map((e) => e.description))}`;
    const truckExpenseRows = TRUCK_EXPENSES.map((e) => ({
      id: randomUUID(),
      account_id: account.id,
      truck_id: truck.id,
      description: e.description,
      category: e.category,
      amount_cents: e.amount,
      spent_on: dateDaysAgo(e.daysAgo),
      vendor_name: e.vendor,
    }));
    await sql`insert into expense ${sql(truckExpenseRows)}`;

    console.log(
      `  ✓ ${truck.name}: ${INGREDIENTS.length} ingredients, ${recNames.length} recipes, ${TRUCK_EXPENSES.length} expenses`,
    );
  }

  // Business-wide expenses (truck_id NULL) — once for the account.
  await sql`delete from expense where account_id = ${account.id} and truck_id is null and description in ${sql(BUSINESS_EXPENSES.map((e) => e.description))}`;
  const bizRows = BUSINESS_EXPENSES.map((e) => ({
    id: randomUUID(),
    account_id: account.id,
    truck_id: null,
    description: e.description,
    category: e.category,
    amount_cents: e.amount,
    spent_on: dateDaysAgo(e.daysAgo),
    vendor_name: e.vendor,
  }));
  await sql`insert into expense ${sql(bizRows)}`;
  console.log(`• Business-wide expenses: ${BUSINESS_EXPENSES.length}`);

  console.log("\n✅ Seed complete. Open Inventory / Recipes / Expenses.");
  console.log("   Tip: hit “Sync” on Operations to generate sales + deplete stock.");
}

main()
  .catch((e) => {
    console.error("✗ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
