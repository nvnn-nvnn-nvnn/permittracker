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
}
export interface RecipeFormValue {
  id: string;
  truckId: string | null;
  name: string;
  category: string | null;
  sellPriceCents: number;
  notes: string | null;
  lines: Line[];
}

export function RecipeForm({
  recipe,
  defaultTruckId,
}: {
  recipe?: RecipeFormValue;
  defaultTruckId?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(recipe);
  const [error, setError] = useState<string | null>(null);
  const [truckId, setTruckId] = useState(
    recipe?.truckId ?? defaultTruckId ?? "",
  );

  const trucks = trpc.truck.list.useQuery();
  // Ingredients are per-truck — only load the selected truck's.
  const ingredients = trpc.inventory.list.useQuery(
    { truckId: truckId || undefined },
    { enabled: Boolean(truckId) },
  );
  const ingMap = useMemo(() => {
    const m = new Map<
      string,
      { name: string; unit: string; unitCostCents: number }
    >();
    for (const i of ingredients.data ?? [])
      m.set(i.id, {
        name: i.name,
        unit: i.unit,
        unitCostCents: i.unitCostCents,
      });
    return m;
  }, [ingredients.data]);

  const [sellPrice, setSellPrice] = useState(
    recipe && recipe.sellPriceCents
      ? (recipe.sellPriceCents / 100).toString()
      : "",
  );
  const [lines, setLines] = useState<Line[]>(recipe?.lines ?? []);

  const sellPriceCents = Math.round((parseFloat(sellPrice) || 0) * 100);
  const cogsCents = lines.reduce((sum, l) => {
    const ing = ingMap.get(l.ingredientId);
    return sum + (ing ? Math.round((l.qty || 0) * ing.unitCostCents) : 0);
  }, 0);
  const marginCents = sellPriceCents - cogsCents;
  const marginPct =
    sellPriceCents > 0 ? Math.round((marginCents / sellPriceCents) * 100) : null;

  const onDone = async () => {
    await utils.recipe.list.invalidate();
    router.push("/recipes");
    router.refresh();
  };
  const create = trpc.recipe.create.useMutation({ onSuccess: onDone });
  const update = trpc.recipe.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!truckId) {
      setError("Pick a truck for this menu item.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const data = {
      truckId,
      name: String(fd.get("name") ?? ""),
      category: String(fd.get("category") ?? ""),
      sellPrice: sellPrice,
      notes: String(fd.get("notes") ?? ""),
      lines: lines.filter((l) => l.ingredientId && l.qty > 0),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && recipe) update.mutate({ id: recipe.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  const addLine = () =>
    setLines((ls) => [...ls, { ingredientId: "", qty: 1 }]);
  const removeLine = (idx: number) =>
    setLines((ls) => ls.filter((_, i) => i !== idx));
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      <Field label="Truck" htmlFor="truckId">
        <select
          id="truckId"
          value={truckId}
          onChange={(e) => setTruckId(e.target.value)}
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Select a truck…
          </option>
          {(trucks.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Menu item name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={recipe?.name ?? ""}
          placeholder="Smash burger"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" htmlFor="category">
          <Input
            id="category"
            name="category"
            defaultValue={recipe?.category ?? ""}
            placeholder="Burgers"
          />
        </Field>
        <Field label="Sell price ($)" htmlFor="sellPrice">
          <Input
            id="sellPrice"
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            placeholder="11.00"
          />
        </Field>
      </div>

      {/* Bill of materials */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Ingredients used</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addLine}
            disabled={ingredients.isLoading || !truckId}
          >
            <Plus /> Add ingredient
          </Button>
        </div>

        {!truckId ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Select a truck above to choose its ingredients.
          </p>
        ) : (ingredients.data?.length ?? 0) === 0 && !ingredients.isLoading ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No ingredients for this truck yet — add some in Inventory first,
            then build the recipe from them.
          </p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No ingredients added. Click “Add ingredient” to build the recipe.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => {
              const ing = ingMap.get(l.ingredientId);
              const lineCost = ing
                ? Math.round((l.qty || 0) * ing.unitCostCents)
                : 0;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={l.ingredientId}
                    onChange={(e) =>
                      setLine(idx, { ingredientId: e.target.value })
                    }
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Select ingredient…</option>
                    {(ingredients.data ?? []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({fmtMoneyCents(i.unitCostCents)}/{i.unit})
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
                    className="w-24"
                    aria-label="Quantity"
                  />
                  <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                    {ing?.unit ?? ""}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtMoneyCents(lineCost)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLine(idx)}
                    aria-label="Remove ingredient"
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live COGS / margin preview */}
      <div className="grid grid-cols-3 gap-3 rounded-lg border bg-secondary/40 p-4">
        <Stat label="Food cost" value={fmtMoneyCents(cogsCents)} />
        <Stat label="Sell price" value={fmtMoneyCents(sellPriceCents)} />
        <Stat
          label="Margin"
          value={
            sellPriceCents > 0
              ? `${fmtMoneyCents(marginCents)}${
                  marginPct !== null ? ` · ${marginPct}%` : ""
                }`
              : "—"
          }
          tone={
            sellPriceCents === 0
              ? undefined
              : marginCents < 0
                ? "text-status-red"
                : "text-status-green"
          }
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

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={recipe?.notes ?? ""} />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add menu item"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/recipes")}
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className={`text-base font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
