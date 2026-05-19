"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Person } from "@/lib/db/schema";

type TruckOption = { id: string; name: string };

export function PersonForm({
  person,
  initialTruckIds = [],
  trucks,
}: {
  person?: Person;
  initialTruckIds?: string[];
  trucks: TruckOption[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(person);
  const [error, setError] = useState<string | null>(null);
  const [truckIds, setTruckIds] = useState<string[]>(initialTruckIds);

  const onDone = async () => {
    await utils.person.list.invalidate();
    router.push("/people");
    router.refresh();
  };
  const create = trpc.person.create.useMutation({ onSuccess: onDone });
  const update = trpc.person.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function toggleTruck(id: string) {
    setTruckIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      role: String(fd.get("role") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      truckIds,
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && person)
      update.mutate({ id: person.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Full name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={person?.name ?? ""}
          placeholder="Jamie Rivera"
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={person?.email ?? ""}
        />
      </Field>
      <Field label="Role" htmlFor="role">
        <Input
          id="role"
          name="role"
          defaultValue={person?.role ?? ""}
          placeholder="Lead operator / food handler"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Label>Assigned trucks</Label>
        <p className="text-xs text-muted-foreground">
          An expired certification for this person flags every active truck
          they&apos;re assigned to.
        </p>
        {trucks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trucks yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {trucks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={truckIds.includes(t.id)}
                  onChange={() => toggleTruck(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={person?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add person"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/people")}
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
