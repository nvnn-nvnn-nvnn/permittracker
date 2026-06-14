import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { classifyItem } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import type { ComplianceItem } from "@/lib/db/schema";

type Row = { item: ComplianceItem; personName: string };

/**
 * Staff certifications (person-held items) that cascade onto this truck via a
 * person→truck assignment. A column of flex rows, matching the items list.
 */
export function TruckStaffItems({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort(
    (a, b) =>
      (classifyItem(a.item).daysToExpiry ?? Number.MAX_SAFE_INTEGER) -
      (classifyItem(b.item).daysToExpiry ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">
          Staff certifications
        </h2>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {rows.length} affecting this truck
        </span>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col divide-y divide-border">
          {sorted.map(({ item, personName }) => {
            const badge = classifyItem(item);
            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">
                    {item.subtype ?? item.identifier ?? "Certification"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {personName} · exp {fmtDate(item.expirationDate)}
                  </span>
                </div>
                <Badge variant={badge.variant} className="shrink-0 font-semibold">
                  {badge.label}
                </Badge>
              </Link>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
