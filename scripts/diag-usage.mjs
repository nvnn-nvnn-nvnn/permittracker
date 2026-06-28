/**
 * Diagnostic: why is inventory_usage empty? Reports trucks, recipes, item
 * sales, usage rows, and whether sale item-names match recipe names per truck.
 *   node scripts/diag-usage.mjs [accountSelector]   (default: admin, else first)
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const norm = (s) => s.trim().toLowerCase();

async function main() {
  const selector = process.argv[2] ?? "admin";
  let account;
  if (selector === "admin") {
    [account] = await sql`
      select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id
      where u.is_platform_admin = true order by a.created_at limit 1`;
  }
  if (!account) [account] = await sql`select id, name from account order by created_at limit 1`;
  if (!account) { console.log("no account"); return; }
  console.log(`Account: ${account.name} (${account.id})\n`);

  const trucks = await sql`select id, name from truck where account_id=${account.id} and archived_at is null`;
  console.log(`Trucks (${trucks.length}): ${trucks.map((t) => `${t.name}=${t.id.slice(0, 8)}`).join(", ")}\n`);

  const recipes = await sql`select truck_id, name from recipe where account_id=${account.id} and archived_at is null`;
  console.log(`Recipes (${recipes.length}):`);
  for (const r of recipes) console.log(`  [${(r.truck_id ?? "NULL").slice(0, 8)}] ${r.name}`);

  const itemSales = await sql`
    select truck_id, item_name, sum(qty_sold)::int as qty, count(*) as days
    from sales_item_day where account_id=${account.id}
    group by truck_id, item_name order by truck_id, item_name`;
  console.log(`\nsales_item_day rows: ${itemSales.length} (item/truck combos)`);
  for (const s of itemSales.slice(0, 20))
    console.log(`  [${(s.truck_id ?? "NULL").slice(0, 8)}] ${s.item_name} — qty ${s.qty} over ${s.days} days`);
  const [range] = await sql`select min(business_date) lo, max(business_date) hi from sales_item_day where account_id=${account.id}`;
  console.log(`  date range: ${range.lo ?? "—"} .. ${range.hi ?? "—"}`);

  const [usage] = await sql`select count(*)::int n, coalesce(sum(cost_cents),0)::int c from inventory_usage where account_id=${account.id}`;
  console.log(`\ninventory_usage rows: ${usage.n}, total cost cents: ${usage.c}`);

  // Match check per (truck, normalized name).
  const recipeKeys = new Set(recipes.map((r) => `${r.truck_id ?? "none"}|${norm(r.name)}`));
  const saleKeys = new Set(itemSales.map((s) => `${s.truck_id ?? "none"}|${norm(s.item_name)}`));
  const matches = [...saleKeys].filter((k) => recipeKeys.has(k));
  console.log(`\nMATCHED (truck+name) sales↔recipes: ${matches.length}`);
  if (matches.length === 0) {
    console.log("  → No matches. Likely cause:");
    const saleTrucks = new Set(itemSales.map((s) => s.truck_id));
    const recipeTrucks = new Set(recipes.map((r) => r.truck_id));
    console.log(`    sale trucks:   ${[...saleTrucks].map((t) => (t ?? "NULL").slice(0, 8)).join(", ") || "(none)"}`);
    console.log(`    recipe trucks: ${[...recipeTrucks].map((t) => (t ?? "NULL").slice(0, 8)).join(", ") || "(none)"}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
