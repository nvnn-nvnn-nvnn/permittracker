import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { ShieldCheck } from "lucide-react";
import { serverApi } from "@/lib/trpc/server";
import { EventForm } from "@/components/features/event-form";
import { EventStatusSelect } from "@/components/features/event-status-select";
import { ArchiveButton } from "@/components/features/archive-button";
import type { Venue } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let event;
  try {
    event = await api.event.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  // Once accepted/confirmed, surface the linked venue's COI requirements.
  let venue: Venue | undefined;
  if (event.venueId && (event.status === "accepted" || event.status === "confirmed")) {
    try {
      venue = await api.venue.byId({ id: event.venueId });
    } catch {
      venue = undefined;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {event.name}
          {event.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!event.archivedAt && (
          <ArchiveButton kind="event" id={event.id} redirectTo="/events" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Status</span>
        <EventStatusSelect id={event.id} status={event.status} />
      </div>

      {venue && (
        <div className="flex items-start gap-3 rounded-xl border border-status-green/40 bg-status-green/5 px-4 py-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-green" />
          <div className="flex-1 space-y-0.5">
            <p className="font-medium text-status-green">
              You&apos;re in — line up the COI
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">{venue.name}</strong> may
              require a certificate of insurance with specific additional-insured
              language. Review its requirements on the{" "}
              <Link
                href={`/venues/${venue.id}`}
                className="font-medium text-brand-ink hover:underline"
              >
                venue page
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <EventForm event={event} />
    </div>
  );
}
