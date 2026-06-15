import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ItemUrgency } from "@/lib/status";

type TruckLite = { id: string; name: string; isActive: boolean };
type Severity = "red" | "yellow" | "green";

const DOT: Record<Severity, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
};
const SEV_LABEL: Record<Severity, string> = {
  red: "Action required",
  yellow: "Attention soon",
  green: "All clear",
};

/**
 * Per-truck status list — "which truck can't operate?" at a glance. A single
 * column of flex rows, one per truck. Severity = worst of the truck's items
 * (cascade-aware via the status engine's ItemUrgency).
 */
export function TruckRollup({
  trucks,
  items,
}: {
  trucks: TruckLite[];
  items: ItemUrgency[];
}) {
  const byTruck = new Map<string, ItemUrgency[]>();
  for (const u of items) {
    const tid = u.item.holderTruckId;
    if (!tid) continue;
    const arr = byTruck.get(tid) ?? [];
    arr.push(u);
    byTruck.set(tid, arr);
  }

  if (trucks.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm font-medium text-muted-foreground">
        No trucks yet.{" "}
        <Link
          href="/trucks/new"
          className="font-semibold text-brand-ink hover:underline"
        >
          Add your first truck
        </Link>
        .
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col divide-y divide-border">
        {trucks.map((t) => {
          const own = byTruck.get(t.id) ?? [];
          const reds = own.filter(
            (u) => u.contributesRed || u.isExpired,
          ).length;
          const yellows = own.filter(
            (u) =>
              !(u.contributesRed || u.isExpired) &&
              (u.expiringSoon || u.feeDueSoon),
          ).length;
          const sev: Severity =
            reds > 0 ? "red" : yellows > 0 ? "yellow" : "green";

          return (
            <Link
              key={t.id}
              href={`/trucks/${t.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/40"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${DOT[sev]}`}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 truncate text-base font-semibold">
                    {t.name}
                    {!t.isActive && (
                      <span className="text-xs font-medium text-muted-foreground">
                        inactive
                      </span>
                    )}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {own.length} item{own.length === 1 ? "" : "s"}
                    {reds > 0 && ` · ${reds} critical`}
                    {yellows > 0 && ` · ${yellows} warning`}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={sev} className="font-semibold">
                  {SEV_LABEL[sev]}
                </Badge>
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
