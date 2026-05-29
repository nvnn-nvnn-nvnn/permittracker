// "use client";

import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import { computeAccountStatus } from "@/lib/status";
import { digestsForAccount } from "@/lib/digest/resolve";
import { currentPeriod } from "@/lib/digest/period";
import { fmtDate, fmtDaysLeft } from "@/lib/format";
import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import {serverApi} from "@/lib/trpc/server";

export const metadata = { title: "Dashboard · VendGuard" };
export const dynamic = "force-dynamic";

const STATUS = {
  red: {
    variant: "red" as const,
    ring: "ring-status-red/30",
    dot: "bg-status-red",
    text: "text-status-red",
    title: "Action required",
    blurb: "An expired item is tied to an active truck. You can't serve.",
  },
  yellow: {
    variant: "yellow" as const,
    ring: "ring-status-yellow/30",
    dot: "bg-status-yellow",
    text: "text-status-yellow",
    title: "Attention soon",
    blurb: "Something is expiring or a fee is due soon.",
  },
  green: {
    variant: "green" as const,
    ring: "ring-status-green/30",
    dot: "bg-status-green",
    text: "text-status-green",
    title: "All clear",
    blurb: "Nothing expiring soon. You're good to serve.",
  },
};

function severityOf(u: {
  contributesRed: boolean;
  isExpired: boolean;
  expiringSoon: boolean;
  feeDueSoon: boolean;
}): "red" | "yellow" | "green" {
  if (u.contributesRed || u.isExpired) return "red";
  if (u.expiringSoon || u.feeDueSoon) return "yellow";
  return "green";
}

export default async function DashboardPage() {
  // Auth + tRPC caller share the same cached account context (cheap call),
  // so kicking them off together costs nothing extra.
  const [ctx, api] = await Promise.all([
    requireAccountContext(),
    serverApi(),
  ]);

  // Three independent I/O calls — fire in parallel instead of waterfalled.
  const [result, digests, trucks] = await Promise.all([
    computeAccountStatus(ctx.accountId),
    digestsForAccount(ctx.accountId, currentPeriod()),
    api.truck.list(),
  ]);
  const activeTrucks = trucks.filter((t) => t.isActive).length;

  const s = STATUS[result.status];
  const { counts } = result;

  const tiles = [
    { label: "Tracked", value: counts.total, tone: "text-foreground" },
    { label: "Critical", value: counts.red, tone: "text-status-red" },
    { label: "Warning", value: counts.yellow, tone: "text-status-yellow" },
    { label: "OK", value: counts.green, tone: "text-status-green" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <Badge
              variant="outline"
              className="gap-1.5 border-border/70 bg-card px-2.5 py-1 text-xs font-medium"
            >
              <Truck className="size-3.5 text-primary" />
              <span className="tabular-nums">{activeTrucks}</span>
              <span className="text-muted-foreground">
                active {activeTrucks === 1 ? "truck" : "trucks"}
              </span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {ctx.accountName} · {ctx.planTier} plan
          </p>
        </div>
        <Link
          href="/items/new"
          className="text-sm font-medium text-primary hover:underline"
        >
          + Add compliance item
        </Link>
      </div>

      {/* Status hero */}
      <Card className={`ring-1 ${s.ring}`}>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={`mt-1.5 inline-flex size-3 shrink-0 rounded-full ${s.dot}`}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={s.variant}>
                  {result.status.toUpperCase()}
                </Badge>
                <h2 className="text-lg font-semibold">{s.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{s.blurb}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:gap-5">
            {tiles.map((t) => (
              <div key={t.label} className="text-center sm:text-right">
                <p className={`text-2xl font-semibold tabular-nums ${t.tone}`}>
                  {t.value}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.label}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Why this status */}
      {result.reasons.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why this status
            </p>
            <ul className="space-y-2 text-sm">
              {result.reasons.slice(0, 6).map((r, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    className={`mt-1.5 inline-block size-1.5 shrink-0 rounded-full ${s.dot}`}
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Commissary cascade */}
      {result.commissaryAlerts.length > 0 && (
        <Card className="ring-1 ring-status-red/30">
          <CardContent className="p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-status-red">
              Commissary cascade · {result.commissaryAlerts.length}
            </p>
            <ul className="space-y-2 text-sm">
              {result.commissaryAlerts.map((a, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span className="font-medium">{a.name}</span>
                  <Badge variant={a.expired ? "red" : "yellow"}>
                    {a.kind} {a.expired ? "expired" : `in ${a.days}d`}
                  </Badge>
                  <span className="text-muted-foreground">
                    blocks {a.truckNames.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}



      {/* Urgency list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            By urgency
          </h2>
          {result.items.length > 0 && (
            <Link
              href="/items"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              View all items
            </Link>
          )}
        </div>

        {result.items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No items tracked yet.{" "}
              <Link
                href="/items/new"
                className="font-medium text-primary hover:underline"
              >
                Add your first one
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border/70">
              {result.items.map((u) => {
                const sev = severityOf(u);
                return (
                  <li key={u.item.id}>
                    <Link
                      href={`/items/${u.item.id}`}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${STATUS[sev].dot}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {u.item.itemType}
                          </span>{" "}
                          {u.item.subtype ?? u.item.identifier ?? "Untitled"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {u.truckName ??
                            u.item.holderName ??
                            u.item.holderType}{" "}
                          · exp {fmtDate(u.item.expirationDate)}
                          {u.blockedBy ? ` · ⛔ ${u.blockedBy}` : ""}
                        </p>
                      </div>
                      <Badge variant={STATUS[sev].variant}>
                        {fmtDaysLeft(u.daysToExpiry)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

  {/* 
  
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">

            <p className="text-md font-medium uppercase tracking-wide">
              Trucks Count
            </p>
            <p>
              {trucks.length}
              `$ trucks.length truck${trucks.length === 1? "" : "s"}`
               trucks
            </p>

    
      
          </div>

        </CardContent>
      </Card>

  
  
  
  
  */}


      

      {digests.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inspection prep · your area
              </p>
              <Link
                href="/digest"
                className="text-xs text-primary hover:underline"
              >
                Read all
              </Link>
            </div>
            <ul className="space-y-2 text-sm">
              {digests.slice(0, 3).map((dg) => (
                <li key={dg.id} className="flex gap-2.5">
                  <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-primary" />
                  <Link href="/digest" className="hover:underline">
                    <span className="font-medium">{dg.title}</span>{" "}
                    <span className="text-muted-foreground">
                      · {dg.jurisdiction}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
