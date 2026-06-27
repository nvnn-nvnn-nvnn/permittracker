"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, PackageCheck, Send, Ban } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderStatus } from "@/lib/db/schema";

/** List-page button: build a draft order from below-par ingredients. */
export function GenerateFromLowStock() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const gen = trpc.purchasing.createFromLowStock.useMutation({
    onSuccess: (row) => {
      if (row) router.push(`/purchasing/${row.id}`);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(null);
          gen.mutate();
        }}
        disabled={gen.isPending}
      >
        <Sparkles />
        {gen.isPending ? "Building…" : "Generate from low stock"}
      </Button>
      {error && <p className="text-xs text-status-red">{error}</p>}
    </div>
  );
}

/** Detail-page status transitions. Receiving bumps ingredient on-hand. */
export function PurchaseOrderStatusActions({
  id,
  status,
}: {
  id: string;
  status: PurchaseOrderStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const set = trpc.purchasing.setStatus.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });
  const busy = set.isPending;
  const go = (
    next: PurchaseOrderStatus,
  ) => set.mutate({ id, status: next });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "draft" && (
          <Button size="sm" disabled={busy} onClick={() => go("ordered")}>
            <Send /> Mark ordered
          </Button>
        )}
        {(status === "draft" || status === "ordered") && (
          <Button size="sm" disabled={busy} onClick={() => go("received")}>
            <PackageCheck /> Receive (add to stock)
          </Button>
        )}
        {status !== "received" && status !== "canceled" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => go("canceled")}
          >
            <Ban /> Cancel order
          </Button>
        )}
        {status === "canceled" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => go("draft")}
          >
            Reopen as draft
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-status-red">{error}</p>}
    </div>
  );
}
