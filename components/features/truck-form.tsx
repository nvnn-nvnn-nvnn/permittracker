"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MN_JURISDICTIONS } from "@/lib/jurisdictions";
import type { Truck } from "@/lib/db/schema";

export function TruckForm({ truck }: { truck?: Truck }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(truck);

  const onDone = async () => {
    await utils.truck.list.invalidate();
    router.push("/trucks");
    router.refresh();
  };
  const create = trpc.truck.create.useMutation({ onSuccess: onDone });
  const update = trpc.truck.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      plateOrVin: String(fd.get("plateOrVin") ?? ""),
      jurisdiction: String(fd.get("jurisdiction") ?? ""),
      isActive: fd.get("isActive") === "on",
      notes: String(fd.get("notes") ?? ""),
    };
    const handler = (e2: unknown) =>
      setError(e2 instanceof Error ? e2.message : "Something went wrong");
    if (isEdit && truck) {
      update.mutate({ id: truck.id, data }, { onError: handler });
    } else {
      create.mutate(data, { onError: handler });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      <Field label="Truck name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={truck?.name ?? ""}
          placeholder="The Rolling Bistro"
        />
      </Field>
      <Field label="Plate / VIN" htmlFor="plateOrVin">
        <Input
          id="plateOrVin"
          name="plateOrVin"
          defaultValue={truck?.plateOrVin ?? ""}
        />
      </Field>
      <Field label="Primary jurisdiction" htmlFor="jurisdiction">
        <Input
          id="jurisdiction"
          name="jurisdiction"
          list="jurisdictions"
          defaultValue={truck?.jurisdiction ?? ""}
          placeholder="Minneapolis Health Department"
        />
        <datalist id="jurisdictions">
          {MN_JURISDICTIONS.map((j) => (
            <option key={j} value={j} />
          ))}
        </datalist>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={truck?.isActive ?? true}
          className="size-4"
        />
        Currently operating (active)
      </label>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={truck?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add truck"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/trucks")}
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
