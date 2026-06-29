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
import {
  getStubSquareAdapter,
  squareAdapterForToken,
  type SquareAdapter,
} from "@/lib/square";
import { getFreshSquareToken } from "@/lib/square/oauth";
import { applyUsageDepletion } from "@/lib/ops/depletion";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SyncResult {
  mode: "live" | "stub";
  trucksSynced: number;
  daysSynced: number;
  start: string;
  end: string;
  /** True if sales synced but inventory depletion failed (retry via Recompute). */
  usageDeferred: boolean;
}

/**
 * Pull Square sales and attribute them per truck.
 *
 * - **Live** (account connected via OAuth, or a static SQUARE_ACCESS_TOKEN):
 *   syncs each truck that has a Square *location* assigned to it (via the
 *   location→truck picker). Each `square_connection` row carries its locationId.
 * - **Stub** (no creds): fabricates demo sales for every active truck, each on
 *   its own synthetic location, so the dashboards work with zero setup.
 *
 * Idempotent: re-running overwrites the same (account, truck, source, date) rows
 * and re-reconciles inventory via depletion.
 */
export async function syncSquareSales(
  accountId: string,
  opts: { days?: number; userId?: string } = {},
): Promise<SyncResult> {
  const db = getDb();
  const env = serverEnv();
  const live = await getFreshSquareToken(accountId);
  const stub = !live && !env.SQUARE_ACCESS_TOKEN;

  const adapter: SquareAdapter = live
    ? squareAdapterForToken(live.accessToken, live.environment)
    : env.SQUARE_ACCESS_TOKEN
      ? squareAdapterForToken(
          env.SQUARE_ACCESS_TOKEN,
          env.SQUARE_ENVIRONMENT,
          env.SQUARE_LOCATION_ID,
        )
      : getStubSquareAdapter();

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (opts.days ?? 90));
  const startYmd = ymd(start);
  const endYmd = ymd(end);
  const now = new Date();

  // The (truck, location) pairs to sync.
  let targets: { truckId: string; locationId: string; locationName: string }[];
  let merchantId = "stub-merchant";

  if (stub) {
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
    targets = trucks.map((t) => ({
      truckId: t.id,
      locationId: `stub-loc-${t.id}`,
      locationName: t.name,
    }));
  } else {
    merchantId = (await adapter.getMerchant()).merchantId;
    // Live: only trucks with a real location assigned (via the picker).
    const conns = await db
      .select()
      .from(squareConnection)
      .where(eq(squareConnection.accountId, accountId));
    targets = conns
      .filter(
        (c) =>
          c.truckId &&
          c.locationId &&
          !c.locationId.startsWith("stub-loc-"),
      )
      .map((c) => ({
        truckId: c.truckId as string,
        locationId: c.locationId as string,
        locationName: c.locationName ?? c.locationId!,
      }));
  }

  let daysSynced = 0;

  for (const target of targets) {
    const daily = await adapter.listDailySales({
      locationId: target.locationId,
      start: startYmd,
      end: endYmd,
    });
    const itemRows = await adapter.listItemSales({
      locationId: target.locationId,
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
            truckId: target.truckId,
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
            truckId: target.truckId,
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

    await db
      .insert(squareConnection)
      .values({
        accountId,
        truckId: target.truckId,
        connected: true,
        merchantId,
        locationId: target.locationId,
        locationName: target.locationName,
        environment: live?.environment ?? env.SQUARE_ENVIRONMENT,
        lastSyncedAt: now,
        connectedByUserId: opts.userId ?? null,
      })
      .onConflictDoUpdate({
        target: squareConnection.truckId,
        set: {
          connected: true,
          merchantId,
          locationName: target.locationName,
          environment: live?.environment ?? env.SQUARE_ENVIRONMENT,
          lastSyncedAt: now,
          updatedAt: now,
        },
      });
  }

  // Auto-deplete inventory from the synced item sales (idempotent). Sales are
  // already persisted above, so a depletion hiccup must NOT discard them — the
  // user can re-run it from "Recompute usage". Surface it as a soft flag.
  let usageDeferred = false;
  try {
    await applyUsageDepletion(accountId, start, end);
  } catch (err) {
    usageDeferred = true;
    console.error("[square-sync] usage depletion failed (deferred):", err);
  }

  return {
    mode: stub ? "stub" : "live",
    trucksSynced: targets.length,
    daysSynced,
    start: startYmd,
    end: endYmd,
    usageDeferred,
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

/** Upsert a truck → Square location mapping (the location picker). */
export async function assignTruckLocation(
  accountId: string,
  truckId: string,
  locationId: string,
  locationName: string,
  merchantId: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(squareConnection)
    .values({
      accountId,
      truckId,
      connected: true,
      merchantId,
      locationId,
      locationName,
      environment: serverEnv().SQUARE_ENVIRONMENT,
    })
    .onConflictDoUpdate({
      target: squareConnection.truckId,
      set: {
        connected: true,
        merchantId,
        locationId,
        locationName,
        updatedAt: now,
      },
    });
}
