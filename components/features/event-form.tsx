"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_STATUS_ORDER, EVENT_STATUS_META } from "@/lib/events";
import type { EventInput } from "@/lib/validators";
import type { Event } from "@/lib/db/schema";

const SELECT_CLASS =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50";

function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function EventForm({ event }: { event?: Event }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(event);
  const [error, setError] = useState<string | null>(null);

  const venues = trpc.venue.list.useQuery();

  const onDone = async () => {
    await utils.event.list.invalidate();
    router.push("/events");
    router.refresh();
  };
  const create = trpc.event.create.useMutation({ onSuccess: onDone });
  const update = trpc.event.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const feeDollars = String(fd.get("fee") ?? "").trim();
    const data = {
      name: String(fd.get("name") ?? ""),
      status: String(fd.get("status") ?? "interested") as EventInput["status"],
      venueId: String(fd.get("venueId") ?? ""),
      location: String(fd.get("location") ?? ""),
      eventDate: String(fd.get("eventDate") ?? ""),
      applicationDeadline: String(fd.get("applicationDeadline") ?? ""),
      applicationUrl: String(fd.get("applicationUrl") ?? ""),
      feeAmountCents: feeDollars === "" ? "" : Math.round(Number(feeDollars) * 100),
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && event) update.mutate({ id: event.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Event name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={event?.name ?? ""}
          placeholder="Downtown Summer Food Festival"
        />
      </Field>

      <Field label="Application status" htmlFor="status">
        <select
          id="status"
          name="status"
          defaultValue={event?.status ?? "interested"}
          className={SELECT_CLASS}
        >
          {EVENT_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {EVENT_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Venue (optional)" htmlFor="venueId">
        <select
          id="venueId"
          name="venueId"
          defaultValue={event?.venueId ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">— No venue —</option>
          {venues.data?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Link a venue to carry its COI / additional-insured requirements once
          you&apos;re accepted.
        </p>
      </Field>

      <Field label="Location (optional)" htmlFor="location">
        <Input
          id="location"
          name="location"
          defaultValue={event?.location ?? ""}
          placeholder="City park, fairgrounds, address…"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Event date" htmlFor="eventDate">
          <Input
            id="eventDate"
            name="eventDate"
            type="date"
            defaultValue={toDateInput(event?.eventDate)}
          />
        </Field>
        <Field label="Application deadline" htmlFor="applicationDeadline">
          <Input
            id="applicationDeadline"
            name="applicationDeadline"
            type="date"
            defaultValue={toDateInput(event?.applicationDeadline)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Vendor fee ($)" htmlFor="fee">
          <Input
            id="fee"
            name="fee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={
              event?.feeAmountCents != null
                ? (event.feeAmountCents / 100).toString()
                : ""
            }
            placeholder="250"
          />
        </Field>
        <Field label="Application link" htmlFor="applicationUrl">
          <Input
            id="applicationUrl"
            name="applicationUrl"
            defaultValue={event?.applicationUrl ?? ""}
            placeholder="https://…"
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={event?.notes ?? ""} />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add event"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/events")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
