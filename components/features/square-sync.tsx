"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plug, RefreshCw, Loader2, CheckCircle2, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

export interface SquareSummaryView {
  connectedCount: number;
  lastSyncedAt: Date | string | null;
  everConnected: boolean;
  isSquareConfigured: boolean;
  oauthConfigured: boolean;
  oauthConnected: boolean;
  merchantId: string | null;
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
  // Needs the OAuth hand-off (app configured, but this account hasn't linked).
  const needsConnect = summary.oauthConfigured && !summary.oauthConnected;
  // Pure demo: no OAuth app and no static token.
  const demo = !summary.oauthConfigured && !summary.isSquareConfigured;
  const live = summary.oauthConnected || summary.isSquareConfigured;

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
              {summary.oauthConnected ? (
                <Badge variant="green" className="gap-1">
                  <CheckCircle2 className="size-3" /> Connected
                </Badge>
              ) : connected ? (
                <Badge variant="green" className="gap-1">
                  <CheckCircle2 className="size-3" /> {summary.connectedCount}{" "}
                  truck{summary.connectedCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
              {demo && (
                <Badge variant="outline" className="text-muted-foreground">
                  demo data
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {needsConnect
                ? "Connect your Square account, then map each location to a truck."
                : connected
                  ? `Last synced ${fmtDate(summary.lastSyncedAt)}${live ? " · map locations to assign trucks" : ""}`
                  : demo
                    ? "No Square account linked — sync loads sample sales per truck so you can preview."
                    : "Map a Square location to each truck, then sync its sales."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {needsConnect ? (
            <a
              href="/api/square/connect"
              className={buttonVariants({ size: "sm" })}
            >
              <Plug /> Connect Square
            </a>
          ) : (
            <Button size="sm" onClick={() => sync.mutate({})} disabled={busy}>
              {sync.isPending ? (
                <Loader2 className="animate-spin" />
              ) : connected ? (
                <RefreshCw />
              ) : (
                <Plug />
              )}
              {connected ? "Sync now" : demo ? "Load demo data" : "Sync now"}
            </Button>
          )}
          {live && (
            <Link
              href="/operations/square"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <MapPin /> Locations
            </Link>
          )}
          {(connected || summary.oauthConnected) && (
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
          {sync.data.trucksSynced === 1 ? "" : "s"}
          {sync.data.mode === "stub" ? " (demo data)" : ""}.
          {sync.data.usageDeferred
            ? " Sales saved, but inventory usage didn't update — hit “Recompute usage” to retry."
            : ""}
        </p>
      )}
    </div>
  );
}
