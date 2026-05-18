import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  commissary,
  complianceItem,
  reminderDispatch,
  truck,
} from "@/lib/db/schema";
import type {
  Commissary,
  ComplianceItem,
  Truck,
} from "@/lib/db/schema";

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
  /** Set when this item's urgency was inherited from its parent (Phase 6). */
  blockedBy: string | null;
}

export interface CommissaryAlert {
  commissaryId: string;
  name: string;
  kind: "permit" | "contract";
  expired: boolean;
  days: number | null;
  truckNames: string[];
}

export interface AccountStatusResult {
  status: AccountStatus;
  reasons: string[];
  items: ItemUrgency[];
  commissaryAlerts: CommissaryAlert[];
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

  const commissaries: Commissary[] = await db
    .select()
    .from(commissary)
    .where(eq(commissary.accountId, accountId));
  const commById = new Map(commissaries.map((c) => [c.id, c]));

  const reasons: string[] = [];
  let red = 0;
  let yellow = 0;
  let green = 0;

  function rankOf(u: ItemUrgency): number {
    if (u.contributesRed) return 0;
    if (u.isExpired) return 10;
    if (u.expiringSoon) return 20 + (u.daysToExpiry ?? 0);
    if (u.feeDueSoon) return 60 + (u.daysToFeeDue ?? 0);
    return 100;
  }

  // Pass 1 — base urgency per non-archived item (no counting yet).
  const base: ItemUrgency[] = items
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
      const u: ItemUrgency = {
        item,
        truckName: t?.name ?? null,
        truckActive,
        daysToExpiry,
        daysToFeeDue,
        isExpired,
        expiringSoon,
        feeDueSoon,
        rank: 100,
        contributesRed:
          isExpired && item.holderType === "truck" && truckActive,
        blockedBy: null,
      };
      u.rank = rankOf(u);
      return u;
    });
  const byId = new Map(base.map((u) => [u.item.id, u]));

  // Pass 2 — parent→child inheritance. Iterate until stable so chains
  // (grandparent→parent→child) fully propagate. Only non-archived parents
  // exist in `byId`, so an archived parent stops the cascade.
  for (let iter = 0; iter < base.length + 1; iter++) {
    let changed = false;
    for (const u of base) {
      const parentId = u.item.parentItemId;
      if (!parentId) continue;
      const p = byId.get(parentId);
      if (!p) continue;
      if (p.isExpired && !u.isExpired) {
        u.isExpired = true;
        u.blockedBy = `parent ${p.item.itemType} expired`;
        u.contributesRed =
          u.item.holderType === "truck" && u.truckActive;
        u.rank = rankOf(u);
        changed = true;
      } else if (p.expiringSoon && !u.expiringSoon && !u.isExpired) {
        u.expiringSoon = true;
        u.blockedBy = `parent ${p.item.itemType} expiring soon`;
        u.rank = rankOf(u);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Pass 3 — count + reasons.
  for (const u of base) {
    if (u.contributesRed) {
      red++;
      reasons.push(
        `${u.item.itemType} "${u.item.identifier ?? "—"}" ${
          u.blockedBy ? `(${u.blockedBy})` : "expired"
        } on active truck ${u.truckName ?? ""}`.trim(),
      );
    } else if (u.isExpired || u.expiringSoon || u.feeDueSoon) {
      yellow++;
    } else {
      green++;
    }
  }
  const urgencies = base.sort((a, b) => a.rank - b.rank);

  // Commissary cascade — a lapsed commissary blocks every active truck
  // based there (brief). Expired → RED; expiring ≤30d → YELLOW.
  const commissaryAlerts: CommissaryAlert[] = [];
  const activeTrucks = trucks.filter(
    (t) => t.isActive && t.archivedAt === null && t.commissaryId,
  );
  const dependents = new Map<string, string[]>();
  for (const t of activeTrucks) {
    const list = dependents.get(t.commissaryId!) ?? [];
    list.push(t.name);
    dependents.set(t.commissaryId!, list);
  }
  for (const [commId, truckNames] of dependents) {
    const c = commById.get(commId);
    if (!c || c.archivedAt) continue;
    for (const kind of ["permit", "contract"] as const) {
      const d = dayDiff(
        kind === "permit" ? c.permitExpiration : c.contractExpiration,
      );
      if (d === null) continue;
      if (d < 0) {
        red++;
        commissaryAlerts.push({
          commissaryId: c.id,
          name: c.name,
          kind,
          expired: true,
          days: d,
          truckNames,
        });
        reasons.push(
          `Commissary "${c.name}" ${kind} expired — blocks ${truckNames.join(", ")}`,
        );
      } else if (d <= 30) {
        yellow++;
        commissaryAlerts.push({
          commissaryId: c.id,
          name: c.name,
          kind,
          expired: false,
          days: d,
          truckNames,
        });
        reasons.push(
          `Commissary "${c.name}" ${kind} expires in ${d}d — affects ${truckNames.join(", ")}`,
        );
      }
    }
  }

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
    commissaryAlerts,
    counts: { red, yellow, green, total: urgencies.length },
  };
}
