/**
 * Read-only: inspect the stored Square OAuth token for an account — what scopes
 * Square actually granted, its merchant, environment, and expiry — then probe
 * /v2/orders/search to reproduce a 403.  node scripts/diag-square-token.mjs [acct]
 */
import { config } from "dotenv";
import postgres from "postgres";
import { createDecipheriv, createHash } from "node:crypto";

config({ path: ".env.local" });
config({ path: ".env" });

const selector = process.argv[2] ?? "admin";

function decryptSecret(payload) {
  const key = createHash("sha256").update(process.env.SQUARE_TOKEN_SECRET).digest();
  const [iv, tag, data] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
const root = (env) =>
  env === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function main() {
  let account;
  if (selector === "admin") {
    [account] = await sql`select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id
      where u.is_platform_admin = true order by a.created_at limit 1`;
  } else if (selector.includes("@")) {
    [account] = await sql`select a.id, a.name from account a
      join app_user u on u.id = a.owner_user_id where lower(u.email)=${selector.toLowerCase()} limit 1`;
  } else {
    [account] = await sql`select id, name from account where lower(name)=${selector.toLowerCase()} limit 1`;
  }
  if (!account) { console.log("no account"); await sql.end(); return; }
  console.log(`Account: ${account.name} (${account.id})`);

  const [row] = await sql`select environment, merchant_id, scopes, expires_at,
      (refresh_token_enc is not null) as has_refresh
    from square_oauth where account_id = ${account.id} limit 1`;
  if (!row) { console.log("No square_oauth row — not connected via OAuth."); await sql.end(); return; }

  console.log(`\nStored row:`);
  console.log(`  environment: ${row.environment}`);
  console.log(`  merchant_id: ${row.merchant_id}`);
  console.log(`  scopes (saved by us): ${row.scopes}`);
  console.log(`  expires_at: ${row.expires_at}`);
  console.log(`  has refresh token: ${row.has_refresh}`);

  const [tokRow] = await sql`select access_token_enc from square_oauth where account_id = ${account.id} limit 1`;
  const token = decryptSecret(tokRow.access_token_enc);
  const env = row.environment === "production" ? "production" : "sandbox";

  // Ask Square what scopes this token REALLY has.
  console.log(`\nAsking Square /oauth2/token/status (${env})…`);
  const statusRes = await fetch(`${root(env)}/oauth2/token/status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2025-01-23" },
  });
  const status = await statusRes.json().catch(() => ({}));
  console.log(`  HTTP ${statusRes.status}`);
  console.log(`  granted scopes: ${JSON.stringify(status.scopes ?? status.errors ?? status)}`);
  console.log(`  expires_at: ${status.expires_at} · merchant: ${status.merchant_id}`);

  // What locations does this production token actually own?
  console.log(`\nThis merchant's real locations (/v2/locations):`);
  const lRes = await fetch(`${root(env)}/v2/locations`, {
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2025-01-23" },
  });
  const lJson = await lRes.json().catch(() => ({}));
  for (const l of lJson.locations ?? [])
    console.log(`  ${l.id}  "${l.name}"  status=${l.status}`);

  console.log(`\nLocations currently mapped to trucks (square_connection):`);
  const mapped = await sql`select truck_id, location_id, location_name
    from square_connection where account_id = ${account.id}`;
  const valid = new Set((lJson.locations ?? []).map((l) => l.id));
  for (const m of mapped)
    console.log(`  ${m.location_id} → truck ${m.truck_id}  ${valid.has(m.location_id) ? "OK" : "✗ NOT this merchant"}`);

  // Reproduce the sync's orders search.
  const [loc] = await sql`select location_id from square_connection
     where account_id = ${account.id} and location_id is not null
       and location_id not like 'stub%' limit 1`;
  console.log(`\nProbing /v2/orders/search at location ${loc?.location_id ?? "(none mapped)"}…`);
  if (loc?.location_id) {
    const oRes = await fetch(`${root(env)}/v2/orders/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Square-Version": "2025-01-23", "Content-Type": "application/json" },
      body: JSON.stringify({ location_ids: [loc.location_id], query: { filter: { state_filter: { states: ["COMPLETED"] } } } }),
    });
    const o = await oRes.json().catch(() => ({}));
    console.log(`  HTTP ${oRes.status}`);
    console.log(`  result: ${JSON.stringify(o.errors ?? { orders: (o.orders ?? []).length })}`);
  }

  await sql.end();
}
main().catch(async (e) => { console.error("Failed:", e.message); await sql.end(); process.exit(1); });
