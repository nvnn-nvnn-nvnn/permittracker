"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TruckStatusValue {
  serviceStatus: "open" | "closed";
  currentLocation: string | null;
  serviceWindow: string | null;
  statusNote: string | null;
}

export function TruckStatusControl({
  truckId,
  initial,
}: {
  truckId: string;
  initial: TruckStatusValue | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"open" | "closed">(
    initial?.serviceStatus ?? "closed",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = trpc.truck.setStatus.useMutation({
    onSuccess: () => {
      setError(null);
      setSaved(true);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    save.mutate({
      truckId,
      serviceStatus: status,
      currentLocation: String(fd.get("currentLocation") ?? ""),
      serviceWindow: String(fd.get("serviceWindow") ?? ""),
      statusNote: String(fd.get("statusNote") ?? ""),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        {(["open", "closed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              status === s
                ? s === "open"
                  ? "border-status-green bg-status-green/10 text-status-green"
                  : "border-border bg-secondary text-foreground"
                : "bg-background text-muted-foreground"
            }`}
          >
            {s === "open" ? "Open now" : "Closed"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentLocation">Today&apos;s location</Label>
          <Input
            id="currentLocation"
            name="currentLocation"
            defaultValue={initial?.currentLocation ?? ""}
            placeholder="Mears Park, St Paul"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serviceWindow">Service window</Label>
          <Input
            id="serviceWindow"
            name="serviceWindow"
            defaultValue={initial?.serviceWindow ?? ""}
            placeholder="11am–2pm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="statusNote">Note (optional)</Label>
        <Input
          id="statusNote"
          name="statusNote"
          defaultValue={initial?.statusNote ?? ""}
          placeholder="Cash only today"
        />
      </div>

      {error && <p className="text-xs text-status-red">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Update status
        </Button>
        {saved && !error && (
          <span className="text-xs text-muted-foreground">Saved</span>
        )}
      </div>
    </form>
  );
}
