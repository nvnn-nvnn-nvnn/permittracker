"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  modificationCategories,
  reinspectionStatusValues,
} from "@/lib/validators";
import { REINSPECTION_META } from "@/lib/modifications";
import { dateInputValue } from "@/lib/format";
import type { TruckModification } from "@/lib/db/schema";

export function ModificationForm({
  modification,
  defaultTruckId,
}: {
  modification?: TruckModification;
  defaultTruckId?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(modification);
  const [error, setError] = useState<string | null>(null);
  const trucks = trpc.truck.list.useQuery();

  const onDone = async () => {
    await utils.modification.list.invalidate();
    router.push("/modifications");
    router.refresh();
  };
  const create = trpc.modification.create.useMutation({ onSuccess: onDone });
  const update = trpc.modification.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      truckId: String(fd.get("truckId") ?? ""),
      description: String(fd.get("description") ?? ""),
      category: String(fd.get("category") ?? ""),
      changedOn: String(fd.get("changedOn") ?? ""),
      reinspectionStatus: String(
        fd.get("reinspectionStatus") ?? "not_required",
      ) as (typeof reinspectionStatusValues)[number],
      reportedToHealthDept: fd.get("reportedToHealthDept") === "on",
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && modification)
      update.mutate({ id: modification.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="truckId">Truck</Label>
        <select
          id="truckId"
          name="truckId"
          required
          defaultValue={modification?.truckId ?? defaultTruckId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Select truck…</option>
          {(trucks.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">What changed</Label>
        <Input
          id="description"
          name="description"
          required
          defaultValue={modification?.description ?? ""}
          placeholder="Added a second deep fryer"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            list="mod-categories"
            defaultValue={modification?.category ?? ""}
            placeholder="Equipment"
          />
          <datalist id="mod-categories">
            {modificationCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="changedOn">Date of change</Label>
          <Input
            id="changedOn"
            name="changedOn"
            type="date"
            required
            defaultValue={dateInputValue(
              modification?.changedOn ?? new Date(),
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reinspectionStatus">Re-inspection</Label>
        <select
          id="reinspectionStatus"
          name="reinspectionStatus"
          defaultValue={modification?.reinspectionStatus ?? "not_required"}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {reinspectionStatusValues.map((s) => (
            <option key={s} value={s}>
              {REINSPECTION_META[s].label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="reportedToHealthDept"
          defaultChecked={modification?.reportedToHealthDept ?? false}
          className="size-4"
        />
        Reported to the health department
      </label>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={modification?.notes ?? ""}
        />
      </div>

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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Log change"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/modifications")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
