"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DigestAdmin() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState<string | null>(null);
  const run = trpc.admin.generateAndSendDigests.useMutation();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Inspection-prep digest
          </p>
          <p className="text-sm text-muted-foreground">
            {msg ??
              "Generate this month's per-jurisdiction digests (Claude) and email each account its set."}
          </p>
        </div>
        <Button
          size="sm"
          disabled={run.isPending}
          onClick={async () => {
            setMsg(null);
            try {
              const r = await run.mutateAsync();
              setMsg(
                `${r.period}: generated ${r.generated}, skipped ${r.skipped}, emailed ${r.emailed}.`,
              );
              await utils.admin.invalidate();
              router.refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          {run.isPending ? "Running…" : "Generate & send now"}
        </Button>
      </CardContent>
    </Card>
  );
}
