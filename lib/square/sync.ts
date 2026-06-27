import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { salesDay, salesItemDay, squareConnection } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getSquareAdapter } from "@/lib/square";

/** YYYY-MM-DD, UTC. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SyncResult {
  merchantId: string;
  locationName: string;
  daysSynced: number;
  start: string;
  end: string;
}

/**
 * Pull daily sales from Square (real or stub) and upsert them into sales_day,
 * (re)establishing the account's square_connection. Idempotent: re-running for
 * the same range overwrites the same (account, source, date) rows.
 *
 * Writes go through the service connection (getDb) — sales_day is synced,
 * recomputable data (like reminder_dispatch), so it is not audited.
 */
export async function syncSquareSales(
  accountId: string,
  opts: { days?: number; userId?: string } = {},
): Promise<SyncResult> {
  const db = getDb();
  const adapter = getSquareAdapter();
  const env = serverEnv();

  const merchant = await adapter.getMerchant();

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (opts.days ?? 90));

  const rows = await adapter.listDailySales({
    locationId: merchant.locationId,
    start: ymd(start),
    end: ymd(end),
  });

  const now = new Date();
  if (rows.length > 0) {
    await db
      .insert(salesDay)
      .values(
        rows.map((r) => ({
          accountId,
          source: "square" as const,
          businessDate: new Date(`${r.date}T00:00:00Z`),
          grossSalesCents: r.grossSalesCents,
          refundsCents: r.refundsCents,
          netSalesCents: r.grossSalesCents - r.refundsCents,
          taxCents: r.taxCents,
          tipsCents: r.tipsCents,
          discountsCents: r.discountsCents,
          transactionCount: r.transactionCount,
          syncedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [salesDay.accountId, salesDay.source, salesDay.businessDate],
        set: {
          grossSalesCents: sql`excluded.gross_sales_cents`,
          refundsCents: sql`excluded.refunds_cents`,
          netSalesCents: sql`excluded.net_sales_cents`,
          taxCents: sql`excluded.tax_cents`,
          tipsCents: sql`excluded.tips_cents`,
          discountsCents: sql`excluded.discounts_cents`,
          transactionCount: sql`excluded.transaction_count`,
          syncedAt: sql`excluded.synced_at`,
          updatedAt: now,
        },
      });
  }

  // Per-item daily sales (order line items) → sales_item_day.
  const itemRows = await adapter.listItemSales({
    locationId: merchant.locationId,
    start: ymd(start),
    end: ymd(end),
  });
  if (itemRows.length > 0) {
    await db
      .insert(salesItemDay)
      .values(
        itemRows.map((r) => ({
          accountId,
          source: "square" as const,
          businessDate: new Date(`${r.date}T00:00:00Z`),
          itemName: r.itemName,
          squareItemId: r.squareItemId ?? null,
          qtySold: r.qtySold,
          grossSalesCents: r.grossSalesCents,
          syncedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          salesItemDay.accountId,
          salesItemDay.source,
          salesItemDay.businessDate,
          salesItemDay.itemName,
        ],
        set: {
          squareItemId: sql`excluded.square_item_id`,
          qtySold: sql`excluded.qty_sold`,
          grossSalesCents: sql`excluded.gross_sales_cents`,
          syncedAt: sql`excluded.synced_at`,
          updatedAt: now,
        },
      });
  }

  // Upsert the connection record (one per account).
  await db
    .insert(squareConnection)
    .values({
      accountId,
      connected: true,
      merchantId: merchant.merchantId,
      locationId: merchant.locationId,
      locationName: merchant.locationName,
      environment: env.SQUARE_ENVIRONMENT,
      lastSyncedAt: now,
      connectedByUserId: opts.userId ?? null,
    })
    .onConflictDoUpdate({
      target: squareConnection.accountId,
      set: {
        connected: true,
        merchantId: merchant.merchantId,
        locationId: merchant.locationId,
        locationName: merchant.locationName,
        environment: env.SQUARE_ENVIRONMENT,
        lastSyncedAt: now,
        updatedAt: now,
      },
    });

  return {
    merchantId: merchant.merchantId,
    locationName: merchant.locationName,
    daysSynced: rows.length,
    start: ymd(start),
    end: ymd(end),
  };
}

/** Mark the account's Square connection disconnected (keeps synced history). */
export async function disconnectSquare(accountId: string): Promise<void> {
  const db = getDb();
  await db
    .update(squareConnection)
    .set({ connected: false, updatedAt: new Date() })
    .where(eq(squareConnection.accountId, accountId));
}

/** The account's Square connection row, or null if never connected. */
export async function getSquareConnection(accountId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(squareConnection)
    .where(and(eq(squareConnection.accountId, accountId)))
    .limit(1);
  return row ?? null;
}
