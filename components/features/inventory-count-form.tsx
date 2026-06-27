"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { fmtMoneyCents, dateInputValue } from "@/lib/format";

export function InventoryCountForm({
  defaultTruckId,
}: {
  defaultTruckId?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const trucks = trpc.truck.list.useQuery();
  const [truckId, setTruckId] = useState(defaultTruckId ?? "");
  const ingredients = trpc.inventory.list.useQuery(
    { truckId: truckId || undefined },
    { enabled: Boolean(truckId) },
  );
  const [error, setError] = useState<string | null>(null);
  const [countedOn, setCountedOn] = useState(dateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);

  // Reset when the truck changes (different ingredient set).
  useEffect(() => {
    setSeeded(false);
    setCounts({});
  }, [truckId]);

  // Seed counted quantities from current on-hand once ingredients load.
  useEffect(() => {
    if (!seeded && ingredients.data) {
      const init: Record<string, string> = {};
      for (const i of ingredients.data) init[i.id] = String(i.onHandQty);
      setCounts(init);
      setSeeded(true);
    }
  }, [ingredients.data, seeded]);

  const rows = ingredients.data ?? [];
  const totalValueCents = rows.reduce((s, i) => {
    const qty = parseFloat(counts[i.id] ?? "0") || 0;
    return s + Math.round(qty * i.unitCostCents);
  }, 0);

  const create = trpc.inventory.createCount.useMutation({
    onSuccess: async () => {
      await utils.inventory.list.invalidate();
      router.push("/inventory/counts");
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!truckId) {
      setError("Pick a truck to count.");
      return;
    }
    create.mutate({
      truckId,
      countedOn,
      note,
      lines: rows.map((i) => ({
        ingredientId: i.id,
        countedQty: parseFloat(counts[i.id] ?? "0") || 0,
      })),
    });
  }

  const truckSelect = (
    <div className="flex max-w-xs flex-col gap-2">
      <Label htmlFor="truckId">Truck</Label>
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
    </div>
  );

  if (!truckId) {
    return (
      <div className="space-y-5">
        {truckSelect}
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Select a truck to count its stock.
        </p>
      </div>
    );
  }

  if (rows.length === 0 && !ingredients.isLoading) {
    return (
      <div className="space-y-5">
        {truckSelect}
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This truck has no ingredients yet — add some in Inventory first.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      {truckSelect}
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="countedOn">Count date</Label>
        <Input
          id="countedOn"
          type="date"
          required
          value={countedOn}
          onChange={(e) => setCountedOn(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="divide-y">
          {rows.map((i) => {
            const qty = parseFloat(counts[i.id] ?? "0") || 0;
            return (
              <div
                key={i.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtMoneyCents(i.unitCostCents)}/{i.unit}
                  </p>
                </div>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={counts[i.id] ?? ""}
                  onChange={(e) =>
                    setCounts((c) => ({ ...c, [i.id]: e.target.value }))
                  }
                  className="w-24"
                  aria-label={`Counted ${i.name}`}
                />
                <span className="w-8 shrink-0 text-xs text-muted-foreground">
                  {i.unit}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {fmtMoneyCents(Math.round(qty * i.unitCostCents))}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">
            Counted inventory value
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {fmtMoneyCents(totalValueCents)}
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Notes</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="End-of-month count"
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

      <p className="text-xs text-muted-foreground">
        Saving updates each ingredient&apos;s on-hand to the counted figure and
        snapshots the total value for actual-COGS reporting.
      </p>

      <div className="flex gap-3">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save count"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/inventory/counts")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
