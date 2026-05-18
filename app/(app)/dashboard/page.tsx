import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import { computeAccountStatus } from "@/lib/status";
import { fmtDate, fmtDaysLeft } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Dashboard · PermitKeep" };
export const dynamic = "force-dynamic";

const STATUS_COPY = {
  red: {
    variant: "red" as const,
    border: "border-status-red/40",
    title: "RED — action required",
    blurb: "An expired item is tied to an active truck. Stop and fix this.",
  },
  yellow: {
    variant: "yellow" as const,
    border: "border-status-yellow/40",
    title: "YELLOW — attention soon",
    blurb: "Something is expiring or a fee is due soon.",
  },
  green: {
    variant: "green" as const,
    border: "border-status-green/40",
    title: "GREEN — all clear",
    blurb: "Nothing expiring soon. You're good to serve.",
  },
};

export default async function DashboardPage() {
  const ctx = await requireAccountContext();
  const result = await computeAccountStatus(ctx.accountId);
  const copy = STATUS_COPY[result.status];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.accountName} · plan {ctx.planTier}
        </p>
      </div>

      <Card className={copy.border}>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Badge variant={copy.variant}>{result.status.toUpperCase()}</Badge>
            {copy.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{copy.blurb}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {result.reasons.slice(0, 5).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-muted-foreground">
            {result.counts.total} active items · {result.counts.red} critical ·{" "}
            {result.counts.yellow} warning · {result.counts.green} ok
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Sorted by urgency
        </h2>
        {result.items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No items tracked yet.{" "}
              <Link href="/items/new" className="underline">
                Add one
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {result.items.map((u) => (
              <Link key={u.item.id} href={`/items/${u.item.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <span className="uppercase text-muted-foreground">
                          {u.item.itemType}
                        </span>{" "}
                        {u.item.subtype ?? u.item.identifier ?? ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {u.truckName ?? u.item.holderName ?? u.item.holderType}{" "}
                        · exp {fmtDate(u.item.expirationDate)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        u.contributesRed
                          ? "red"
                          : u.isExpired || u.expiringSoon || u.feeDueSoon
                            ? "yellow"
                            : "green"
                      }
                    >
                      {fmtDaysLeft(u.daysToExpiry)}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
