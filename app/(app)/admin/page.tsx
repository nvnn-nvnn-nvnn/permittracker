import { notFound } from "next/navigation";
import { requireAccountContext } from "@/lib/auth/session";
import { serverApi } from "@/lib/trpc/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin · PermitKeep" };
export const dynamic = "force-dynamic";

function usd(microUsd: number): string {
  return (microUsd / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
  });
}

export default async function AdminPage() {
  const ctx = await requireAccountContext();
  if (!ctx.isPlatformAdmin) notFound();

  const api = await serverApi();
  const { totals, recent } = await api.admin.extractionCostSummary();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Extraction calls" value={String(totals.calls)} />
        <Stat
          label="Tokens (in / out)"
          value={`${totals.inputTokens} / ${totals.outputTokens}`}
        />
        <Stat label="Total cost" value={usd(Number(totals.costMicroUsd))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent extractions</CardTitle>
          <CardDescription>
            Cost per Claude OCR call (newest first).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {recent.length === 0 ? (
            <p className="text-muted-foreground">No extractions yet.</p>
          ) : (
            recent.map((r) => (
              <div
                key={r.id}
                className="flex justify-between gap-4 border-b py-1 last:border-0"
              >
                <span className="text-muted-foreground">
                  {r.createdAt.toLocaleString("en-US")} · {r.model}
                </span>
                <span className="font-medium">{usd(r.costMicroUsd)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
