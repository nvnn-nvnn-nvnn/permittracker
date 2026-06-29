"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Card } from "@/components/ui/card";

export interface PickerTruck {
  truckId: string;
  truckName: string;
  locationId: string | null;
}
export interface PickerLocation {
  id: string;
  name: string;
}

/** Map each truck to a Square location (one truck per location); each change
 *  saves immediately. "None" unmaps the truck. */
export function SquareLocationPicker({
  trucks,
  locations,
}: {
  trucks: PickerTruck[];
  locations: PickerLocation[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assign = trpc.ops.assignLocation.useMutation();
  const unassign = trpc.ops.unassignLocation.useMutation();

  // location id -> the truck currently holding it (to block duplicates).
  const takenBy = new Map<string, string>();
  for (const t of trucks) if (t.locationId) takenBy.set(t.locationId, t.truckId);

  async function onPick(truckId: string, locationId: string) {
    setSavingId(truckId);
    setSavedId(null);
    setError(null);
    try {
      if (locationId === "") {
        await unassign.mutateAsync({ truckId });
      } else {
        const loc = locations.find((l) => l.id === locationId);
        if (!loc) return;
        await assign.mutateAsync({
          truckId,
          locationId: loc.id,
          locationName: loc.name,
        });
      }
      setSavedId(truckId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that mapping.");
      router.refresh(); // revert the <select> to the server's truth
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden p-0">
        <div className="divide-y">
          {trucks.map((t) => (
            <div
              key={t.truckId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="min-w-0 truncate font-medium">
                {t.truckName}
              </span>
              <div className="flex items-center gap-2">
                {savingId === t.truckId && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                {savedId === t.truckId && savingId !== t.truckId && (
                  <Check className="size-4 text-status-green" />
                )}
                <select
                  value={t.locationId ?? ""}
                  onChange={(e) => onPick(t.truckId, e.target.value)}
                  disabled={savingId === t.truckId}
                  className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">None — not connected</option>
                  {locations.map((l) => {
                    const owner = takenBy.get(l.id);
                    const takenByOther = owner && owner !== t.truckId;
                    return (
                      <option key={l.id} value={l.id} disabled={!!takenByOther}>
                        {l.name}
                        {takenByOther ? " (in use)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {error && <p className="text-xs text-status-red">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Each Square location maps to one truck. Set a truck to “None” to free its
        location for another.
      </p>
    </div>
  );
}
