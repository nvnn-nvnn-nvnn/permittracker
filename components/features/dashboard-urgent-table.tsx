import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtDate, fmtDaysLeft } from "@/lib/format";
import type { ItemUrgency } from "@/lib/status";

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
// Soft full-row wash so expired items separate from merely-soon ones.
const ROW: Record<Severity, string> = {
  red: "bg-status-red/[0.05] hover:bg-status-red/[0.1]",
  yellow: "bg-status-yellow/[0.06] hover:bg-status-yellow/[0.12]",
  green: "hover:bg-accent/40",
};

/**
 * The dashboard's main table: everything that needs attention (expired,
 * expiring within 30 days, or a fee due soon), most urgent first. Driven by
 * the status engine's ItemUrgency so cascade flags show too.
 */
export function DashboardUrgentTable({ items }: { items: ItemUrgency[] }) {
  const urgent = items
    .filter(
      (u) =>
        u.contributesRed || u.isExpired || u.expiringSoon || u.feeDueSoon,
    )
    .sort((a, b) => a.rank - b.rank);

  if (urgent.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-1 px-5 py-14 text-center">
        <span className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-status-green/15 text-lg text-status-green">
          ✓
        </span>
        <p className="text-base font-semibold text-status-green">
          You&apos;re all clear
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing is expired or expiring soon. We&apos;ll warn you before
          anything lapses.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Item</th>
              <th className="px-5 py-3 font-semibold">Assigned to</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">
                Expires
              </th>
              <th className="px-5 py-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {urgent.map((u) => {
              const sev = severityOf(u);
              return (
                <tr
                  key={u.item.id}
                  className={`border-b border-border/70 transition-colors last:border-0 ${ROW[sev]}`}
                >
                  <td className="py-4 pl-5 pr-3">
                    <Link
                      href={`/items/${u.item.id}`}
                      className="flex items-center gap-3"
                    >
                      <span
                        className={`size-2.5 shrink-0 rounded-full ring-4 ${DOT[sev]} ${
                          sev === "red"
                            ? "ring-status-red/15"
                            : sev === "yellow"
                              ? "ring-status-yellow/15"
                              : "ring-status-green/15"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {u.item.subtype ?? u.item.identifier ?? "Untitled"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {u.item.itemType}
                          </span>
                          {u.blockedBy && (
                            <span className="truncate text-xs text-muted-foreground">
                              ⛔ {u.blockedBy}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-4 text-muted-foreground">
                    {u.truckName ?? u.item.holderName ?? u.item.holderType}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-4 text-muted-foreground md:table-cell">
                    {fmtDate(u.item.expirationDate)}
                  </td>
                  <td className="py-4 pl-3 pr-5 text-right">
                    <Badge variant={sev} className="font-semibold">
                      {fmtDaysLeft(u.daysToExpiry)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
