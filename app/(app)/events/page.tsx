import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EVENT_STATUS_ORDER, EVENT_STATUS_META } from "@/lib/events";
import type { Event } from "@/lib/db/schema";

export const metadata = { title: "Events · CartLedger" };
export const dynamic = "force-dynamic";

function fmtDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function fmtFee(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString()}`;
}

/** Days until the application deadline, midnight-aligned. */
function deadlineDays(d: Date | string | null): number | null {
  if (!d) return null;
  const due = new Date(d);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export default async function EventsPage() {
  const api = await serverApi();
  const [events, venues] = await Promise.all([
    api.event.list(),
    api.venue.list(),
  ]);
  const venueName = new Map(venues.map((v) => [v.id, v.name]));

  const grouped = EVENT_STATUS_ORDER.map((status) => ({
    status,
    rows: events.filter((e) => e.status === status),
  })).filter((g) => g.rows.length > 0);

  const openCount = events.filter((e) => EVENT_STATUS_META[e.status].open).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          {events.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {openCount} open in your pipeline · {events.length} total
            </p>
          )}
        </div>
        <Link href="/events/new" className={buttonVariants({ size: "sm" })}>
          Add event
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-sm font-medium">No events yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Track prospective events you want to apply to and watch each
              application&apos;s status — from interested all the way to
              confirmed.
            </p>
            <Link
              href="/events/new"
              className={buttonVariants({ size: "sm", className: "mt-4" })}
            >
              Add your first event
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ status, rows }) => (
            <section key={status} className="space-y-2.5">
              <div className="flex items-center gap-2.5 px-1">
                <Badge variant={EVENT_STATUS_META[status].variant}>
                  {EVENT_STATUS_META[status].label}
                </Badge>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </div>
              <Card className="overflow-hidden p-0">
                <div className="flex flex-col divide-y divide-border">
                  {rows.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      venue={e.venueId ? venueName.get(e.venueId) : undefined}
                    />
                  ))}
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, venue }: { event: Event; venue?: string }) {
  const meta = [
    venue,
    event.location,
    fmtDate(event.eventDate) && `Event ${fmtDate(event.eventDate)}`,
    fmtFee(event.feeAmountCents),
  ].filter(Boolean);

  const open = EVENT_STATUS_META[event.status].open;
  const days = open ? deadlineDays(event.applicationDeadline) : null;

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">{event.name}</span>
        {meta.length > 0 && (
          <span className="truncate text-sm text-muted-foreground">
            {meta.join(" · ")}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {days !== null && (
          <span
            className={`text-xs tabular-nums ${
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
        )}
        <ChevronRight className="size-4 text-muted-foreground/50" />
      </div>
    </Link>
  );
}
