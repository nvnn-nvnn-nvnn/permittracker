import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { complianceItem, reminderDispatch, truck } from "@/lib/db/schema";
import type { ComplianceItem, Truck } from "@/lib/db/schema";

export type AccountStatus = "red" | "yellow" | "green";

export interface ItemUrgency {
  item: ComplianceItem;
  truckName: string | null;
  truckActive: boolean;
  /** Whole days until expiration (negative = expired). null = no date. */
  daysToExpiry: number | null;
  daysToFeeDue: number | null;
  isExpired: boolean;
  expiringSoon: boolean; // ≤30 days
  feeDueSoon: boolean; // ≤14 days
  /** Lower = more urgent (drives dashboard sort). */
  rank: number;
  contributesRed: boolean;
}

export interface AccountStatusResult {
  status: AccountStatus;
  reasons: string[];
  items: ItemUrgency[];
  counts: { red: number; yellow: number; green: number; total: number };
}

/** Whole-day difference (target − today), date-only, tz-stable via UTC. */
function dayDiff(target: Date | null): number | null {
  if (!target) return null;
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Compute the account headline status + per-item urgency.
 *
 * RED    — an EXPIRED item tied to an ACTIVE, non-archived truck (you cannot
 *          legally serve on that truck).
 * YELLOW — anything expiring ≤30d, OR a fee due ≤14d, OR an expired item not
 *          already counted as RED. (Unacknowledged-reminder >48h clause is
 *          wired in Phase 4 when reminders exist.)
 * GREEN  — none of the above.
 */
export interface ItemBadge {
  label: string;
  variant: "green" | "yellow" | "red" | "outline";
  daysToExpiry: number | null;
}

/** Pure per-item classification for list rows (no DB). */
export function classifyItem(args: {
  expirationDate: Date | null;
  archivedAt: Date | null;
}): ItemBadge {
  if (args.archivedAt)
    return { label: "Archived", variant: "outline", daysToExpiry: null };
  const d = dayDiff(args.expirationDate);
  if (d === null)
    return { label: "No expiry", variant: "outline", daysToExpiry: null };
  if (d < 0)
    return { label: `Expired ${-d}d ago`, variant: "red", daysToExpiry: d };
  if (d <= 30)
    return { label: `${d}d left`, variant: "yellow", daysToExpiry: d };
  return { label: `${d}d left`, variant: "green", daysToExpiry: d };
}

export async function computeAccountStatus(
  accountId: string,
): Promise<AccountStatusResult> {
  const db = getDb();

  const trucks: Truck[] = await db
    .select()
    .from(truck)
    .where(eq(truck.accountId, accountId));
  const truckById = new Map(trucks.map((t) => [t.id, t]));

  const items: ComplianceItem[] = await db
    .select()
    .from(complianceItem)
    .where(
      and(
        eq(complianceItem.accountId, accountId),
        // archived items don't affect status
      ),
    );

  const reasons: string[] = [];
  let red = 0;
  let yellow = 0;
  let green = 0;

  const urgencies: ItemUrgency[] = items
    .filter((i) => i.archivedAt === null)
    .map((item) => {
      const t = item.holderTruckId
        ? (truckById.get(item.holderTruckId) ?? null)
        : null;
      const truckActive = t ? t.isActive && t.archivedAt === null : false;

      const daysToExpiry = dayDiff(item.expirationDate);
      const daysToFeeDue = dayDiff(item.feeDueDate);
      const isExpired = daysToExpiry !== null && daysToExpiry < 0;
      const expiringSoon =
        daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 30;
      const feeDueSoon =
        daysToFeeDue !== null && daysToFeeDue >= 0 && daysToFeeDue <= 14;

      const contributesRed =
        isExpired && item.holderType === "truck" && truckActive;

      let rank = 100;
      if (contributesRed) rank = 0;
      else if (isExpired) rank = 10;
      else if (expiringSoon) rank = 20 + (daysToExpiry ?? 0);
      else if (feeDueSoon) rank = 60 + (daysToFeeDue ?? 0);

      if (contributesRed) {
        red++;
        reasons.push(
          `${item.itemType} "${item.identifier ?? "—"}" expired on active truck ${t?.name ?? ""}`.trim(),
        );
      } else if (isExpired || expiringSoon || feeDueSoon) {
        yellow++;
      } else {
        green++;
      }

      return {
        item,
        truckName: t?.name ?? null,
        truckActive,
        daysToExpiry,
        daysToFeeDue,
        isExpired,
        expiringSoon,
        feeDueSoon,
        rank,
        contributesRed,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // YELLOW clause (deferred from Phase 2, wired now): a reminder that was
  // sent > 48h ago and still hasn't been acknowledged, on a live item.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const staleUnacked = await db
    .select({ id: reminderDispatch.id })
    .from(reminderDispatch)
    .innerJoin(
      complianceItem,
      eq(complianceItem.id, reminderDispatch.complianceItemId),
    )
    .where(
      and(
        eq(reminderDispatch.accountId, accountId),
        eq(reminderDispatch.status, "sent"),
        isNull(reminderDispatch.acknowledgedAt),
        lt(reminderDispatch.sentAt, cutoff),
        isNull(complianceItem.archivedAt),
      ),
    )
    .limit(1);
  const hasStaleUnacked = staleUnacked.length > 0;

  let status: AccountStatus = "green";
  if (red > 0) status = "red";
  else if (yellow > 0 || hasStaleUnacked) status = "yellow";

  if (hasStaleUnacked) {
    reasons.push("A sent reminder is unacknowledged after 48 hours");
  }
  if (status === "yellow" && reasons.length === 0) {
    reasons.push("Items expiring within 30 days or fees due soon");
  }
  if (status === "green") reasons.push("All tracked items current");

  return {
    status,
    reasons,
    items: urgencies,
    counts: { red, yellow, green, total: urgencies.length },
  };
}
