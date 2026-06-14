import Link from "next/link";
import { Warehouse, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CommissaryAlert } from "@/lib/status";

const ROW = {
  red: "bg-status-red/[0.05] hover:bg-status-red/[0.1]",
  yellow: "bg-status-yellow/[0.06] hover:bg-status-yellow/[0.12]",
} as const;
const DOT = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
} as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Commissary cascade — a lapsed commissary's permit/contract blocks every
 * active truck based there. Surfaced separately from item urgency because the
 * blocker is the commissary, not an item the user can renew on a truck.
 */
export function CommissaryCascade({ alerts }: { alerts: CommissaryAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0 ring-1 ring-status-red/20">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Warehouse className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Commissary cascade</h3>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
            {alerts.length}
          </span>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          A lapsed commissary blocks every active truck based there.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border/70">
        {alerts.map((a) => {
          const sev = a.expired ? "red" : "yellow";
          return (
            <Link
              key={`${a.commissaryId}-${a.kind}`}
              href={`/commissaries/${a.commissaryId}`}
              className={`flex items-center justify-between gap-4 px-5 py-4 transition-colors ${ROW[sev]}`}
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${DOT[sev]} ring-4 ${
                    sev === "red"
                      ? "ring-status-red/15"
                      : "ring-status-yellow/15"
                  }`}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">
                    {a.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Blocks {a.truckNames.join(", ")}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={sev} className="font-semibold">
                  {cap(a.kind)}{" "}
                  {a.expired ? "expired" : `due in ${a.days}d`}
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
