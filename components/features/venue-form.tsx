"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Venue } from "@/lib/db/schema";

export function VenueForm({ venue }: { venue?: Venue }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(venue);
  const [error, setError] = useState<string | null>(null);

  const onDone = async () => {
    await utils.venue.list.invalidate();
    router.push("/venues");
    router.refresh();
  };
  const create = trpc.venue.create.useMutation({ onSuccess: onDone });
  const update = trpc.venue.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      address: String(fd.get("address") ?? ""),
      additionalInsuredText: String(fd.get("additionalInsuredText") ?? ""),
      coiRequirements: String(fd.get("coiRequirements") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && venue) update.mutate({ id: venue.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Venue name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={venue?.name ?? ""}
          placeholder="State Fair — Food Building"
        />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" defaultValue={venue?.address ?? ""} />
      </Field>
      <Field
        label="Additional-insured language"
        htmlFor="additionalInsuredText"
      >
        <Textarea
          id="additionalInsuredText"
          name="additionalInsuredText"
          defaultValue={venue?.additionalInsuredText ?? ""}
          placeholder="Name the venue + organizer as additional insured…"
        />
      </Field>
      <Field label="COI requirements" htmlFor="coiRequirements">
        <Textarea
          id="coiRequirements"
          name="coiRequirements"
          defaultValue={venue?.coiRequirements ?? ""}
          placeholder="$1M per occurrence, $2M aggregate…"
        />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={venue?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add venue"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/venues")}
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
