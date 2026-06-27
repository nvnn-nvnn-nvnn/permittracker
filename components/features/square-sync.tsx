"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

export interface SquareSummaryView {
  connectedCount: number;
  lastSyncedAt: Date | string | null;
  everConnected: boolean;
  isSquareConfigured: boolean;
}

export function SquareSync({ summary }: { summary: SquareSummaryView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const sync = trpc.ops.sync.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });
  const disconnect = trpc.ops.disconnect.useMutation({
    onSuccess: () => router.refresh(),
  });

  const busy = sync.isPending || disconnect.isPending;
  const connected = summary.connectedCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
            <Plug className="size-4 text-brand-ink" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Square
              {connected ? (
                <Badge variant="green" className="gap-1">
                  <CheckCircle2 className="size-3" /> {summary.connectedCount}{" "}
                  truck{summary.connectedCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
              {!summary.isSquareConfigured && (
                <Badge variant="outline" className="text-muted-foreground">
                  demo data
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {connected
                ? `Last synced ${fmtDate(summary.lastSyncedAt)} · each active truck syncs its own sales`
                : summary.isSquareConfigured
                  ? "Pull sales for each active truck to see per-truck performance."
                  : "No Square token set — syncing loads sample sales per truck so you can preview."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => sync.mutate({})} disabled={busy}>
            {sync.isPending ? (
              <Loader2 className="animate-spin" />
            ) : connected ? (
              <RefreshCw />
            ) : (
              <Plug />
            )}
            {connected ? "Sync now" : "Connect Square"}
          </Button>
          {connected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => disconnect.mutate()}
              disabled={busy}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-status-red">{error}</p>}
      {sync.isSuccess && !error && (
        <p className="text-xs text-muted-foreground">
          Synced {sync.data.trucksSynced} truck
          {sync.data.trucksSynced === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
