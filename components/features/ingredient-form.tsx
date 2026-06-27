"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ingredientUnits } from "@/lib/validators";
import type { Ingredient } from "@/lib/db/schema";

export function IngredientForm({ ingredient }: { ingredient?: Ingredient }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(ingredient);
  const [error, setError] = useState<string | null>(null);

  const onDone = async () => {
    await utils.inventory.list.invalidate();
    router.push("/inventory");
    router.refresh();
  };
  const create = trpc.inventory.create.useMutation({ onSuccess: onDone });
  const update = trpc.inventory.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      category: String(fd.get("category") ?? ""),
      unit: String(fd.get("unit") ?? "each") || "each",
      unitCost: String(fd.get("unitCost") ?? ""),
      onHandQty: String(fd.get("onHandQty") ?? "0") || "0",
      parLevel: String(fd.get("parLevel") ?? ""),
      reorderToQty: String(fd.get("reorderToQty") ?? ""),
      supplierName: String(fd.get("supplierName") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && ingredient)
      update.mutate({ id: ingredient.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  const costDollars =
    ingredient && ingredient.unitCostCents
      ? (ingredient.unitCostCents / 100).toString()
      : "";

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={ingredient?.name ?? ""}
          placeholder="Brioche buns"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" htmlFor="category">
          <Input
            id="category"
            name="category"
            defaultValue={ingredient?.category ?? ""}
            placeholder="Bakery"
          />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Input
            id="unit"
            name="unit"
            list="unit-options"
            defaultValue={ingredient?.unit ?? "each"}
            placeholder="each"
          />
          <datalist id="unit-options">
            {ingredientUnits.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cost per unit ($)" htmlFor="unitCost">
          <Input
            id="unitCost"
            name="unitCost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={costDollars}
            placeholder="0.45"
          />
        </Field>
        <Field label="On hand" htmlFor="onHandQty">
          <Input
            id="onHandQty"
            name="onHandQty"
            type="number"
            step="any"
            min="0"
            defaultValue={ingredient?.onHandQty ?? 0}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Reorder at (par)" htmlFor="parLevel">
          <Input
            id="parLevel"
            name="parLevel"
            type="number"
            step="any"
            min="0"
            defaultValue={ingredient?.parLevel ?? ""}
            placeholder="Leave blank to skip alerts"
          />
        </Field>
        <Field label="Reorder up to" htmlFor="reorderToQty">
          <Input
            id="reorderToQty"
            name="reorderToQty"
            type="number"
            step="any"
            min="0"
            defaultValue={ingredient?.reorderToQty ?? ""}
            placeholder="Target after restock"
          />
        </Field>
      </div>

      <Field label="Supplier" htmlFor="supplierName">
        <Input
          id="supplierName"
          name="supplierName"
          defaultValue={ingredient?.supplierName ?? ""}
          placeholder="US Foods"
        />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={ingredient?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add ingredient"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/inventory")}
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
