"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_VARIANT: Record<string, "green" | "yellow" | "red" | "outline"> =
  {
    scheduled: "outline",
    sent: "yellow",
    failed: "red",
    skipped: "outline",
  };

function fmt(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", { timeZone: "UTC" });
}

export function RemindersPanel({
  complianceItemId,
}: {
  complianceItemId: string;
}) {
  const utils = trpc.useUtils();
  const list = trpc.reminder.listForItem.useQuery({ complianceItemId });
  const runNow = trpc.reminder.runDueNow.useMutation();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Reminders</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={runNow.isPending}
          onClick={async () => {
            setMsg(null);
            try {
              const r = await runNow.mutateAsync();
              setMsg(
                `Processed ${r.processed} · sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped}`,
              );
              await utils.reminder.listForItem.invalidate({
                complianceItemId,
              });
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          {runNow.isPending ? "Running…" : "Run due reminders now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        {list.isLoading && (
          <p className="text-muted-foreground">Loading…</p>
        )}
        {list.data?.length === 0 && (
          <p className="text-muted-foreground">
            No reminders scheduled. Set an expiration date and reminder
            offsets on the item above — they&apos;ll appear here.
          </p>
        )}
        {list.data?.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {d.kind === "fee" ? "Fee" : "Expiry"} ·{" "}
                {d.offsetDays === 0
                  ? "day of"
                  : `${d.offsetDays}d before`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {d.acknowledgedAt
                  ? `Acknowledged ${fmt(d.acknowledgedAt)}`
                  : d.sentAt
                    ? `Sent ${fmt(d.sentAt)}`
                    : `Scheduled ${fmt(d.scheduledFor)}`}
              </p>
            </div>
            {d.acknowledgedAt ? (
              <Badge variant="green">acknowledged</Badge>
            ) : (
              <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>
                {d.status}
              </Badge>
            )}
          </div>
        ))}
        <p className="pt-2 text-xs text-muted-foreground">
          Reminders email the account owner. Only the recipient can
          acknowledge, via the one-click link in the email — never automatic.
        </p>
      </CardContent>
    </Card>
  );
}
