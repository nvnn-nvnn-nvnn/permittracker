import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtDaysLeft } from "@/lib/format";
import { TYPE_ORDER, TYPE_LABEL, TYPE_ICON } from "@/lib/item-display";
import type { ItemUrgency } from "@/lib/status";
import type { ItemType } from "@/lib/db/schema";

type Severity = "red" | "yellow" | "green";

function severityOf(u: ItemUrgency): Severity {
  if (u.contributesRed || u.isExpired) return "red";
  if (u.expiringSoon || u.feeDueSoon) return "yellow";
  return "green";
}

const DOT: Record<Severity, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
};
const SEV_LABEL: Record<Severity, string> = {
  red: "Action needed",
  yellow: "Soon",
  green: "OK",
};

function worstOf(items: ItemUrgency[]): Severity {
  if (items.some((u) => severityOf(u) === "red")) return "red";
  if (items.some((u) => severityOf(u) === "yellow")) return "yellow";
  return "green";
}

/**
 * A truck's items grouped into collapsible type folders. ALL five categories
 * are listed, even when empty (empty folders collapse, with an Add affordance).
 */
export function TruckItems({
  items,
  truckId,
}: {
  items: ItemUrgency[];
  truckId: string;
}) {
  const byType = new Map<ItemType, ItemUrgency[]>();
  for (const u of items) {
    const arr = byType.get(u.item.itemType) ?? [];
    arr.push(u);
    byType.set(u.item.itemType, arr);
  }

  return (
    <div className="flex flex-col gap-4">
      {TYPE_ORDER.map((type) => {
        const group = (byType.get(type) ?? [])
          .slice()
          .sort((a, b) => a.rank - b.rank);
        const isEmpty = group.length === 0;
        const worst = isEmpty ? null : worstOf(group);
        const Icon = TYPE_ICON[type];
        return (
          <details
            key={type}
            open={!isEmpty}
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]"
          >
            {/* Folder header row */}
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-center gap-3">
                <Icon
                  className={`size-[18px] shrink-0 ${
                    isEmpty ? "text-muted-foreground/50" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-base font-semibold ${
                    isEmpty ? "text-muted-foreground" : ""
                  }`}
                >
                  {TYPE_LABEL[type]}
                </span>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {group.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {worst && (
                  <Badge variant={worst} className="font-semibold">
                    {SEV_LABEL[worst]}
                  </Badge>
                )}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </div>
            </summary>

            {/* Folder body */}
            {isEmpty ? (
              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <span className="text-sm text-muted-foreground">
                  None tracked yet.
                </span>
                <Link
                  href={`/items/new?truck=${truckId}&type=${type}`}
                  className="text-sm font-medium text-brand-ink hover:underline"
                >
                  Add
                </Link>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border border-t border-border">
                {group.map((u) => {
                  const sev = severityOf(u);
                  return (
                    <Link
                      key={u.item.id}
                      href={`/items/${u.item.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span
                          className={`size-2.5 shrink-0 rounded-full ${DOT[sev]}`}
                          aria-hidden
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold">
                            {u.item.subtype ?? u.item.identifier ?? "Untitled"}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {u.item.identifier
                              ? `${u.item.identifier} · `
                              : ""}
                            exp {fmtDate(u.item.expirationDate)}
                            {u.blockedBy ? ` · ⛔ ${u.blockedBy}` : ""}
                          </span>
                        </div>
                      </div>
                      <Badge variant={sev} className="shrink-0 font-semibold">
                        {fmtDaysLeft(u.daysToExpiry)}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
