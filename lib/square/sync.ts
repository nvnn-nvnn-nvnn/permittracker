import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  salesDay,
  salesItemDay,
  squareConnection,
  truck,
} from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getSquareAdapter, isSquareConfigured } from "@/lib/square";
import { applyUsageDepletion } from "@/lib/ops/depletion";

/** YYYY-MM-DD, UTC. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SyncResult {
  merchantId: string;
  trucksSynced: number;
  daysSynced: number;
  start: string;
  end: string;
}

/**
 * Per-truck Square sync. Each active truck = its own Square location; we pull
 * that location's sales and tag them with the truck. The stub fabricates
 * distinct demo sales per location (seeded by locationId) so each truck differs.
 *
 * Real multi-location: every truck currently maps to the merchant's primary
 * location (a per-truck location picker is deferred until live OAuth). Writes
 * go through the service connection (synced/recomputable data, not audited).
 * Idempotent: re-running overwrites the same (account, truck, source, date) rows.
 */
export async function syncSquareSales(
  accountId: string,
  opts: { days?: number; userId?: string } = {},
): Promise<SyncResult> {
  const db = getDb();
  const adapter = getSquareAdapter();
  const env = serverEnv();
  const stub = !isSquareConfigured();

  const merchant = await adapter.getMerchant();

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (opts.days ?? 90));
  const startYmd = ymd(start);
  const endYmd = ymd(end);
  const now = new Date();

  const trucks = await db
    .select({ id: truck.id, name: truck.name })
    .from(truck)
    .where(
      and(
        eq(truck.accountId, accountId),
        isNull(truck.archivedAt),
        eq(truck.isActive, true),
      ),
    );

  let daysSynced = 0;

  for (const t of trucks) {
    // Stub: one synthetic location per truck so demo data differs. Real:
    // the merchant's primary location (per-truck picker deferred).
    const locationId = stub ? `stub-loc-${t.id}` : merchant.locationId;

    const daily = await adapter.listDailySales({
      locationId,
      start: startYmd,
      end: endYmd,
    });
    const itemRows = await adapter.listItemSales({
      locationId,
      start: startYmd,
      end: endYmd,
    });
    daysSynced += daily.length;

    if (daily.length > 0) {
      await db
        .insert(salesDay)
        .values(
          daily.map((r) => ({
            accountId,
            truckId: t.id,
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
          target: [
            salesDay.accountId,
            salesDay.truckId,
            salesDay.source,
            salesDay.businessDate,
          ],
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

    if (itemRows.length > 0) {
      await db
        .insert(salesItemDay)
        .values(
          itemRows.map((r) => ({
            accountId,
            truckId: t.id,
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
            salesItemDay.truckId,
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

    // One connection row per truck.
    await db
      .insert(squareConnection)
      .values({
        accountId,
        truckId: t.id,
        connected: true,
        merchantId: merchant.merchantId,
        locationId,
        locationName: stub ? t.name : merchant.locationName,
        environment: env.SQUARE_ENVIRONMENT,
        lastSyncedAt: now,
        connectedByUserId: opts.userId ?? null,
      })
      .onConflictDoUpdate({
        target: squareConnection.truckId,
        set: {
          connected: true,
          merchantId: merchant.merchantId,
          locationId,
          locationName: stub ? t.name : merchant.locationName,
          environment: env.SQUARE_ENVIRONMENT,
          lastSyncedAt: now,
          updatedAt: now,
        },
      });
  }

  // Auto-deplete inventory from the synced item sales (idempotent, account-wide
  // in Phase 1; per-truck stock arrives in Phase 2).
  await applyUsageDepletion(accountId, start, end);

  return {
    merchantId: merchant.merchantId,
    trucksSynced: trucks.length,
    daysSynced,
    start: startYmd,
    end: endYmd,
  };
}

/** Disconnect all of the account's Square connections (keeps synced history). */
export async function disconnectSquare(accountId: string): Promise<void> {
  const db = getDb();
  await db
    .update(squareConnection)
    .set({ connected: false, updatedAt: new Date() })
    .where(eq(squareConnection.accountId, accountId));
}

/** Account-level Square summary: connected truck count + last sync. */
export async function getSquareSummary(accountId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(squareConnection)
    .where(eq(squareConnection.accountId, accountId))
    .orderBy(desc(squareConnection.lastSyncedAt));
  const connected = rows.filter((r) => r.connected);
  return {
    connectedCount: connected.length,
    lastSyncedAt: rows[0]?.lastSyncedAt ?? null,
    everConnected: rows.length > 0,
  };
}
