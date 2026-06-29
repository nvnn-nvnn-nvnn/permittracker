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

/** Map each truck to a Square location; each change saves immediately. */
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
  const assign = trpc.ops.assignLocation.useMutation();

  async function onPick(truckId: string, locationId: string) {
    const loc = locations.find((l) => l.id === locationId);
    if (!loc) return;
    setSavingId(truckId);
    setSavedId(null);
    try {
      await assign.mutateAsync({
        truckId,
        locationId: loc.id,
        locationName: loc.name,
      });
      setSavedId(truckId);
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y">
        {trucks.map((t) => (
          <div
            key={t.truckId}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="min-w-0 truncate font-medium">{t.truckName}</span>
            <div className="flex items-center gap-2">
              {savingId === t.truckId && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {savedId === t.truckId && savingId !== t.truckId && (
                <Check className="size-4 text-status-green" />
              )}
              <select
                defaultValue={t.locationId ?? ""}
                onChange={(e) => onPick(t.truckId, e.target.value)}
                className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  Choose a Square location…
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
