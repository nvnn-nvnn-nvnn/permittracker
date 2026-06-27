"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

export function QuickBooksExport() {
  const utils = trpc.useUtils();
  const [days, setDays] = useState<number>(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRows, setLastRows] = useState<number | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await utils.ops.financialExport.fetch({ days });
      const blob = new Blob([res.csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setLastRows(res.rowCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Range:</span>
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            className={`rounded-full border px-3 py-1 text-xs ${
              days === r.days
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Button type="button" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        Download CSV
      </Button>

      {error && <p className="text-xs text-status-red">{error}</p>}
      {lastRows !== null && !error && (
        <p className="text-xs text-muted-foreground">
          Exported {lastRows} transaction{lastRows === 1 ? "" : "s"}. Import it
          in QuickBooks under Transactions → Import.
        </p>
      )}
    </div>
  );
}
