"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Queue = {
  manualReviewFiles: {
    fileId: string;
    filename: string;
    accountName: string;
    itemId: string | null;
  }[];
  inboundDrafts: {
    itemId: string;
    itemType: string;
    identifier: string | null;
    accountName: string;
  }[];
  conciergeAccounts: {
    accountId: string;
    name: string;
    purchasedAt: string | Date | null;
  }[];
};

export function AdminQueue({ queue }: { queue: Queue }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    await utils.admin.conciergeQueue.invalidate();
    await utils.admin.overview.invalidate();
    router.refresh();
  };
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const markReviewed = trpc.admin.markFileReviewed.useMutation();
  const dismissDraft = trpc.admin.dismissDraft.useMutation();
  const conciergeDone = trpc.admin.markConciergeComplete.useMutation();

  const total =
    queue.manualReviewFiles.length +
    queue.inboundDrafts.length +
    queue.conciergeAccounts.length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">
          Concierge queue
          <Badge variant={total > 0 ? "yellow" : "green"} className="ml-2">
            {total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {total === 0 && (
          <p className="text-muted-foreground">Queue is clear. 🎉</p>
        )}

        {queue.manualReviewFiles.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Low-confidence files · {queue.manualReviewFiles.length}
            </p>
            {queue.manualReviewFiles.map((f) => (
              <div
                key={f.fileId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.accountName}
                    {f.itemId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/items/${f.itemId}`}
                          className="text-brand-ink hover:underline"
                        >
                          open item
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === f.fileId}
                  onClick={() =>
                    run(f.fileId, () =>
                      markReviewed.mutateAsync({ fileId: f.fileId }),
                    )
                  }
                >
                  {busy === f.fileId ? "…" : "Mark reviewed"}
                </Button>
              </div>
            ))}
          </section>
        )}

        {queue.inboundDrafts.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Inbound drafts · {queue.inboundDrafts.length}
            </p>
            {queue.inboundDrafts.map((d) => (
              <div
                key={d.itemId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <span className="uppercase text-muted-foreground">
                      {d.itemType}
                    </span>{" "}
                    {d.identifier ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.accountName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/items/${d.itemId}`}
                    className="text-xs text-brand-ink hover:underline self-center"
                  >
                    open
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === d.itemId}
                    onClick={() =>
                      run(d.itemId, () =>
                        dismissDraft.mutateAsync({ itemId: d.itemId }),
                      )
                    }
                  >
                    {busy === d.itemId ? "…" : "Dismiss"}
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {queue.conciergeAccounts.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Concierge onboarding · {queue.conciergeAccounts.length}
            </p>
            {queue.conciergeAccounts.map((a) => (
              <div
                key={a.accountId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <p className="font-medium">{a.name}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === a.accountId}
                  onClick={() =>
                    run(a.accountId, () =>
                      conciergeDone.mutateAsync({ accountId: a.accountId }),
                    )
                  }
                >
                  {busy === a.accountId ? "…" : "Mark complete"}
                </Button>
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
