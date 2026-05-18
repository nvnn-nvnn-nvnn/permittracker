"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateInputValue } from "@/lib/format";
import type { Commissary } from "@/lib/db/schema";

export function CommissaryForm({ commissary }: { commissary?: Commissary }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(commissary);
  const [error, setError] = useState<string | null>(null);

  const onDone = async () => {
    await utils.commissary.list.invalidate();
    router.push("/commissaries");
    router.refresh();
  };
  const create = trpc.commissary.create.useMutation({ onSuccess: onDone });
  const update = trpc.commissary.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      address: String(fd.get("address") ?? ""),
      permitExpiration: String(fd.get("permitExpiration") ?? ""),
      contractExpiration: String(fd.get("contractExpiration") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && commissary)
      update.mutate({ id: commissary.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Commissary name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={commissary?.name ?? ""}
          placeholder="North Loop Shared Kitchen"
        />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input
          id="address"
          name="address"
          defaultValue={commissary?.address ?? ""}
        />
      </Field>
      <Field label="Permit expiration" htmlFor="permitExpiration">
        <Input
          id="permitExpiration"
          name="permitExpiration"
          type="date"
          defaultValue={dateInputValue(commissary?.permitExpiration)}
        />
      </Field>
      <Field label="Contract expiration" htmlFor="contractExpiration">
        <Input
          id="contractExpiration"
          name="contractExpiration"
          type="date"
          defaultValue={dateInputValue(commissary?.contractExpiration)}
        />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          defaultValue={commissary?.notes ?? ""}
        />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add commissary"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/commissaries")}
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
