"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";

/** Re-runs auto-depletion against existing sales + recipes (no Square pull). */
export function RecomputeUsageButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const recompute = trpc.ops.recomputeUsage.useMutation({
    onSuccess: (r) => {
      setMsg(
        r.matchedItems > 0
          ? `Updated usage from ${r.matchedItems} matched item-days across ${r.ingredientsTouched} ingredients.`
          : `No matches found (${r.unmatchedItems} item-days had no recipe on their truck).`,
      );
      router.refresh();
    },
    onError: (e) => setMsg(e.message),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setMsg(null);
          recompute.mutate();
        }}
        disabled={recompute.isPending}
      >
        {recompute.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <RefreshCw />
        )}
        Recompute usage
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
