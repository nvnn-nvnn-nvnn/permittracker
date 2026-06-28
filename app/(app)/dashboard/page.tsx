// "use client";

import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import { computeAccountStatus } from "@/lib/status";
import { digestsForAccount } from "@/lib/digest/resolve";
import { currentPeriod } from "@/lib/digest/period";
import { Truck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TruckRollup } from "@/components/features/truck-rollup";
import { DashboardUrgentTable } from "@/components/features/dashboard-urgent-table";
import { CommissaryCascade } from "@/components/features/commissary-cascade";
import { DashboardOnboarding } from "@/components/features/dashboard-onboarding";
import { EVENT_STATUS_META } from "@/lib/events";

import {serverApi} from "@/lib/trpc/server";

export const metadata = { title: "Dashboard · CartLedger" };
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


export default async function DashboardPage() {
  // Auth + tRPC caller share the same cached account context (cheap call),
  // so kicking them off together costs nothing extra.
  const [ctx, api] = await Promise.all([
    requireAccountContext(),
    serverApi(),
  ]);

  // Three independent I/O calls — fire in parallel instead of waterfalled.
  const [result, digests, trucks, notify, events] = await Promise.all([
    computeAccountStatus(ctx.accountId),
    digestsForAccount(ctx.accountId, currentPeriod()),
    api.truck.list(),
    api.account.notificationSettings(),
    api.event.list(),
  ]);
  const activeTrucks = trucks.filter((t) => t.isActive).length;

  // Brand-new account: nothing tracked at all. Show the first-run walkthrough
  // instead of an empty dashboard — a truck has to exist before anything else.
  if (trucks.length === 0 && result.items.length === 0) {
    return <DashboardOnboarding name={ctx.accountName} />;
  }

  const s = STATUS[result.status];
  const { counts } = result;
  const needsAttention = result.items.filter(
    (u) => u.contributesRed || u.isExpired || u.expiringSoon || u.feeDueSoon,
  ).length;

  // Events pipeline summary: how many are still open, and the soonest
  // application deadlines among open events.
  const openEvents = events.filter((e) => EVENT_STATUS_META[e.status].open);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingDeadlines = openEvents
    .filter((e) => e.applicationDeadline != null)
    .map((e) => {
      const due = new Date(e.applicationDeadline as Date);
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      return { event: e, due, days };
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 3);

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
              <Truck className="size-3.5 text-brand-ink" />
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
          className="text-sm font-medium text-brand-ink hover:underline"
        >
          + Add compliance item
        </Link>
      </div>

      {/* Email reminders disabled — the user opted out in Settings. */}
      {!notify.notifyEmail && (
        <div className="flex items-start gap-3 rounded-xl border border-status-red/40 bg-status-red/5 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-red" />
          <div className="flex-1 space-y-0.5">
            <p className="font-medium text-status-red">
              Email reminders are turned off
            </p>
            <p className="text-muted-foreground">
              CartLedger won&apos;t email you before a permit, inspection, cert,
              or COI expires. Turn reminders back on in{" "}
              <Link
                href="/settings"
                className="font-medium text-brand-ink hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      )}

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

      {/* Main table — everything that needs attention */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight">
              Needs attention
            </h2>
            {needsAttention > 0 && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                {needsAttention}
              </span>
            )}
          </div>
          <Link
            href="/items"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View all items
          </Link>
        </div>
        <DashboardUrgentTable items={result.items} />
      </div>

      {/* Commissary cascade */}
      <CommissaryCascade alerts={result.commissaryAlerts} />

      {/* Events pipeline */}
      {events.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Events pipeline
                </h2>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                  {openEvents.length} open
                </span>
              </div>
              <Link
                href="/events"
                className="text-xs text-brand-ink hover:underline"
              >
                View all
              </Link>
            </div>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No application deadlines set on your open events.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingDeadlines.map(({ event, days }) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      href={`/events/${event.id}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {event.name}
                    </Link>
                    <Badge variant={EVENT_STATUS_META[event.status].variant}>
                      {EVENT_STATUS_META[event.status].label}
                    </Badge>
                    <span
                      className={`shrink-0 tabular-nums ${
                        days < 0
                          ? "font-medium text-status-red"
                          : days <= 14
                            ? "font-medium text-status-yellow"
                            : "text-muted-foreground"
                      }`}
                    >
                      {days < 0
                        ? `${Math.abs(days)}d overdue`
                        : days === 0
                          ? "due today"
                          : `apply in ${days}d`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}



      {/* Per-truck rollup — which truck can operate, at a glance */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            By truck
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/trucks/new"
              className="text-brand-ink hover:underline"
            >
              + Add truck
            </Link>
            {result.items.length > 0 && (
              <Link
                href="/items"
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                View all items
              </Link>
            )}
          </div>
        </div>
        <TruckRollup trucks={trucks} items={result.items} />
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
                className="text-xs text-brand-ink hover:underline"
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
