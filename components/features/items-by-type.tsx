import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { classifyItem } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import { TYPE_ORDER, TYPE_LABEL, TYPE_ICON } from "@/lib/item-display";
import type { ComplianceItem, ItemType } from "@/lib/db/schema";

type Variant = "green" | "yellow" | "red" | "outline";

const DOT: Record<Variant, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
  outline: "bg-muted-foreground/40",
};

const RANK: Record<Variant, number> = { red: 0, yellow: 1, green: 2, outline: 3 };

/**
 * Items separated into a multi-column folder grid, one column per type
 * (Permits / Inspections / Certifications / COIs / Vehicle). Each column lists
 * its items, soonest-to-expire first.
 */
export function ItemsByType({
  items,
  truckName,
}: {
  items: ComplianceItem[];
  truckName: Map<string, string>;
}) {
  const byType = new Map<ItemType, ComplianceItem[]>();
  for (const it of items) {
    const arr = byType.get(it.itemType) ?? [];
    arr.push(it);
    byType.set(it.itemType, arr);
  }

  return (
    <div className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {TYPE_ORDER.map((type) => {
        const Icon = TYPE_ICON[type];
        const group = (byType.get(type) ?? [])
          .slice()
          .sort((a, b) => {
            const ca = classifyItem(a);
            const cb = classifyItem(b);
            // Most urgent first: by status, then soonest expiry.
            const r = RANK[ca.variant] - RANK[cb.variant];
            if (r !== 0) return r;
            return (
              (ca.daysToExpiry ?? Number.MAX_SAFE_INTEGER) -
              (cb.daysToExpiry ?? Number.MAX_SAFE_INTEGER)
            );
          });
        const isEmpty = group.length === 0;
        const worst = group.reduce<Variant>((w, it) => {
          const v = classifyItem(it).variant;
          return RANK[v] < RANK[w] ? v : w;
        }, "outline");

        return (
          <section
            key={type}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-pop)]"
          >
            <Link
              href={`/items/category/${type}`}
              className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 transition-colors hover:bg-accent/40"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${DOT[worst]}`}
                  aria-hidden
                />
                <Icon
                  className={`size-4 shrink-0 ${
                    isEmpty ? "text-muted-foreground/50" : "text-muted-foreground"
                  }`}
                />
                <h3
                  className={`truncate text-base font-semibold ${
                    isEmpty ? "text-muted-foreground" : ""
                  }`}
                >
                  {TYPE_LABEL[type]}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                  {group.length}
                </span>
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </div>
            </Link>

            {isEmpty ? (
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <span className="text-sm text-muted-foreground">
                  None tracked yet.
                </span>
                <Link
                  href={`/items/new?type=${type}`}
                  className="text-sm font-medium text-brand-ink hover:underline"
                >
                  Add
                </Link>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {group.map((it) => {
                const badge = classifyItem(it);
                const holder = it.holderTruckId
                  ? (truckName.get(it.holderTruckId) ?? "Truck")
                  : (it.holderName ?? it.holderType);
                return (
                  <Link
                    key={it.id}
                    href={`/items/${it.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {it.subtype ?? it.identifier ?? "Untitled"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {holder} · exp {fmtDate(it.expirationDate)}
                      </span>
                    </div>
                    <Badge
                      variant={badge.variant}
                      className="shrink-0 font-semibold"
                    >
                      {badge.label}
                    </Badge>
                  </Link>
                );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
