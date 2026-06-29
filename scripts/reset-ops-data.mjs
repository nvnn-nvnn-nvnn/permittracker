/**
 * Reset an account's operations FINANCIAL data to a clean slate, so P&L reads
 * $0 and you can ingest real Square sales from scratch.
 *
 *   node scripts/reset-ops-data.mjs [accountSelector]          # dry run (counts only)
 *   node scripts/reset-ops-data.mjs [accountSelector] --yes    # actually delete
 *
 * - accountSelector: "admin" (default), an email, or an account name.
 *
 * WIPES (for that account): sales_day, sales_item_day, inventory_usage,
 * expense, purchase_order (+items), inventory_count (+lines); resets every
 * ingredient's on_hand_qty to 0; removes leftover demo/stub Square connections.
 *
 * KEEPS: trucks, ingredients (definitions), recipes, the account + users, and
 * any real (non-stub) Square location→truck mappings.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const selector = args.find((a) => !a.startsWith("--")) ?? "admin";
const confirmed = args.includes("--yes");

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function main() {
  // Resolve account.
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
  const id = account.id;
  console.log(`Account: ${account.name} (${id})`);

  // Count what we'd affect (read-only).
  const counts = {};
  const one = async (label, q) => {
    const [{ n }] = await q;
    counts[label] = Number(n);
  };
  await one("sales_day", sql`select count(*) n from sales_day where account_id = ${id}`);
  await one("sales_item_day", sql`select count(*) n from sales_item_day where account_id = ${id}`);
  await one("inventory_usage", sql`select count(*) n from inventory_usage where account_id = ${id}`);
  await one("expense", sql`select count(*) n from expense where account_id = ${id}`);
  await one("purchase_order", sql`select count(*) n from purchase_order where account_id = ${id}`);
  await one("inventory_count", sql`select count(*) n from inventory_count where account_id = ${id}`);
  await one("ingredients(on_hand>0)", sql`select count(*) n from ingredient where account_id = ${id} and on_hand_qty <> 0`);
  await one("stub square_connection", sql`select count(*) n from square_connection where account_id = ${id} and location_id like 'stub%'`);

  console.log("\nWould affect:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);

  if (!confirmed) {
    console.log("\nDry run only. Re-run with --yes to delete.");
    await sql.end();
    return;
  }

  console.log("\nDeleting…");
  await sql.begin(async (tx) => {
    // Children first (FK-safe), then parents. Both line tables carry account_id.
    await tx`delete from purchase_order_item where account_id = ${id}`;
    await tx`delete from inventory_count_line where account_id = ${id}`;
    await tx`delete from inventory_usage where account_id = ${id}`;
    await tx`delete from sales_item_day where account_id = ${id}`;
    await tx`delete from sales_day where account_id = ${id}`;
    await tx`delete from expense where account_id = ${id}`;
    await tx`delete from purchase_order where account_id = ${id}`;
    await tx`delete from inventory_count where account_id = ${id}`;
    await tx`delete from square_connection where account_id = ${id} and location_id like 'stub%'`;
    await tx`update ingredient set on_hand_qty = 0, updated_at = now() where account_id = ${id}`;
  });

  console.log("Done. P&L is now $0 for this account; trucks, ingredients, and recipes kept.");
  console.log("Reconnect/Sync real Square data when ready.");
  await sql.end();
}

main().catch(async (e) => {
  console.error("Failed:", e.message);
  await sql.end();
  process.exit(1);
});
