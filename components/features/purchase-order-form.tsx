"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtMoneyCents } from "@/lib/format";

interface Line {
  ingredientId: string;
  qty: number;
  unitCost: string; // dollars
}
export interface PurchaseOrderFormValue {
  id: string;
  truckId: string | null;
  supplierName: string | null;
  notes: string | null;
  lines: { ingredientId: string; qty: number; unitCostCents: number }[];
}

export function PurchaseOrderForm({
  order,
}: {
  order?: PurchaseOrderFormValue;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(order);
  const [error, setError] = useState<string | null>(null);

  const ingredients = trpc.inventory.list.useQuery();
  const trucks = trpc.truck.list.useQuery();
  const ingMap = useMemo(() => {
    const m = new Map<string, { unit: string; unitCostCents: number }>();
    for (const i of ingredients.data ?? [])
      m.set(i.id, { unit: i.unit, unitCostCents: i.unitCostCents });
    return m;
  }, [ingredients.data]);

  const [lines, setLines] = useState<Line[]>(
    order?.lines.map((l) => ({
      ingredientId: l.ingredientId,
      qty: l.qty,
      unitCost: l.unitCostCents ? (l.unitCostCents / 100).toString() : "",
    })) ?? [],
  );

  const totalCents = lines.reduce((sum, l) => {
    const cents = Math.round((parseFloat(l.unitCost) || 0) * 100);
    return sum + Math.round((l.qty || 0) * cents);
  }, 0);

  const onDone = async () => {
    await utils.purchasing.list.invalidate();
    router.push("/purchasing");
    router.refresh();
  };
  const create = trpc.purchasing.create.useMutation({ onSuccess: onDone });
  const update = trpc.purchasing.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      truckId: String(fd.get("truckId") ?? ""),
      supplierName: String(fd.get("supplierName") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      lines: lines
        .filter((l) => l.ingredientId && l.qty > 0)
        .map((l) => ({
          ingredientId: l.ingredientId,
          qty: l.qty,
          unitCost: l.unitCost,
        })),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && order) update.mutate({ id: order.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  const addLine = () =>
    setLines((ls) => [...ls, { ingredientId: "", qty: 1, unitCost: "" }]);
  const removeLine = (idx: number) =>
    setLines((ls) => ls.filter((_, i) => i !== idx));
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  // When an ingredient is picked, prefill its current cost if none entered.
  const onPickIngredient = (idx: number, ingredientId: string) => {
    const ing = ingMap.get(ingredientId);
    setLines((ls) =>
      ls.map((l, i) =>
        i === idx
          ? {
              ...l,
              ingredientId,
              unitCost:
                l.unitCost || !ing
                  ? l.unitCost
                  : (ing.unitCostCents / 100).toString(),
            }
          : l,
      ),
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplierName">
          <Input
            id="supplierName"
            name="supplierName"
            defaultValue={order?.supplierName ?? ""}
            placeholder="US Foods"
          />
        </Field>
        <Field label="Truck" htmlFor="truckId">
          <select
            id="truckId"
            name="truckId"
            defaultValue={order?.truckId ?? ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Unassigned (business-wide)</option>
            {(trucks.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Items to order</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addLine}
            disabled={ingredients.isLoading}
          >
            <Plus /> Add item
          </Button>
        </div>

        {(ingredients.data?.length ?? 0) === 0 && !ingredients.isLoading ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No ingredients yet — add some in Inventory first.
          </p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No items yet. Click “Add item” to build the order.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => {
              const cents = Math.round((parseFloat(l.unitCost) || 0) * 100);
              const lineCost = Math.round((l.qty || 0) * cents);
              const ing = ingMap.get(l.ingredientId);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={l.ingredientId}
                    onChange={(e) => onPickIngredient(idx, e.target.value)}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Select ingredient…</option>
                    {(ingredients.data ?? []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={l.qty}
                    onChange={(e) =>
                      setLine(idx, { qty: parseFloat(e.target.value) || 0 })
                    }
                    className="w-20"
                    aria-label="Quantity"
                  />
                  <span className="w-8 shrink-0 text-xs text-muted-foreground">
                    {ing?.unit ?? ""}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.unitCost}
                    onChange={(e) => setLine(idx, { unitCost: e.target.value })}
                    className="w-24"
                    placeholder="$/unit"
                    aria-label="Unit cost"
                  />
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtMoneyCents(lineCost)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLine(idx)}
                    aria-label="Remove item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-secondary/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">Order total</span>
        <span className="text-lg font-semibold tabular-nums">
          {fmtMoneyCents(totalCents)}
        </span>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={order?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create order"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/purchasing")}
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
