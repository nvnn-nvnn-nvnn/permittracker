"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

export interface SquareConnectionView {
  connected: boolean;
  locationName: string | null;
  environment: string | null;
  lastSyncedAt: Date | string | null;
}

export function SquareSync({
  connection,
  isSquareConfigured,
}: {
  connection: SquareConnectionView | null;
  isSquareConfigured: boolean;
}) {
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
  const isConnected = connection?.connected ?? false;

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
              {isConnected ? (
                <Badge variant="green" className="gap-1">
                  <CheckCircle2 className="size-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
              {!isSquareConfigured && (
                <Badge variant="outline" className="text-muted-foreground">
                  demo data
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? `${connection?.locationName ?? "Location"} · last synced ${fmtDate(
                    connection?.lastSyncedAt ?? null,
                  )}`
                : isSquareConfigured
                  ? "Pull your sales to see weekly performance."
                  : "No Square token set — connecting loads sample sales so you can preview the dashboard."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => sync.mutate({})}
            disabled={busy}
          >
            {sync.isPending ? (
              <Loader2 className="animate-spin" />
            ) : isConnected ? (
              <RefreshCw />
            ) : (
              <Plug />
            )}
            {isConnected ? "Sync now" : "Connect Square"}
          </Button>
          {isConnected && (
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

      {error && (
        <p className="text-xs text-status-red">{error}</p>
      )}
      {sync.isSuccess && !error && (
        <p className="text-xs text-muted-foreground">
          Synced {sync.data.daysSynced} day
          {sync.data.daysSynced === 1 ? "" : "s"} of sales.
        </p>
      )}
    </div>
  );
}
