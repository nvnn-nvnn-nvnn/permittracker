import { notFound } from "next/navigation";
import { requireAccountContext } from "@/lib/auth/session";
import { serverApi } from "@/lib/trpc/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminQueue } from "@/components/features/admin-queue";
import { DigestAdmin } from "@/components/features/digest-admin";

export const metadata = { title: "Admin · PermitKeep" };
export const dynamic = "force-dynamic";

function usd(microUsd: number): string {
  return (microUsd / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  const ctx = await requireAccountContext();
  if (!ctx.isPlatformAdmin) notFound();

  const api = await serverApi();
  const [overview, queue, cost] = await Promise.all([
    api.admin.overview(),
    api.admin.conciergeQueue(),
    api.admin.extractionCostSummary(),
  ]);

  const d = overview.dispatch;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Cross-tenant ops · gated by platform-admin role
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={String(overview.counts.accounts)} />
        <Stat label="Active items" value={String(overview.counts.items)} />
        <Stat
          label="OCR spend"
          value={usd(Number(cost.totals.costMicroUsd))}
        />
        <Stat
          label="OCR accept rate"
          value={
            overview.accuracy.acceptRatePct === null
              ? "—"
              : `${overview.accuracy.acceptRatePct}%`
          }
          tone="text-primary"
        />
      </div>

      <AdminQueue queue={queue} />

      <DigestAdmin />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Extraction accuracy
            </p>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-lg font-semibold text-status-green tabular-nums">
                  {overview.accuracy.applied}
                </p>
                <p className="text-xs text-muted-foreground">applied</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-status-red tabular-nums">
                  {overview.accuracy.rejected}
                </p>
                <p className="text-xs text-muted-foreground">rejected</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {overview.accuracy.pending}
                </p>
                <p className="text-xs text-muted-foreground">pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reminder dispatch monitor
            </p>
            <div className="flex flex-wrap gap-2">
              {(["scheduled", "sent", "failed", "skipped"] as const).map(
                (k) => (
                  <Badge
                    key={k}
                    variant={
                      k === "failed"
                        ? "red"
                        : k === "sent"
                          ? "green"
                          : "outline"
                    }
                  >
                    {k} {d[k] ?? 0}
                  </Badge>
                ),
              )}
            </div>
            {overview.recentFailed.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {overview.recentFailed.map((f) => (
                  <p key={f.id} className="truncate">
                    <span className="text-status-red">{f.channel}</span> ·{" "}
                    {f.error ?? "error"}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent OCR calls · {cost.totals.calls} total /{" "}
            {usd(Number(cost.totals.costMicroUsd))}
          </p>
          {cost.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extractions yet.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {cost.recent.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between gap-4 border-b border-border/60 py-1 last:border-0"
                >
                  <span className="truncate text-muted-foreground">
                    {r.createdAt.toLocaleString("en-US")} · {r.model}
                  </span>
                  <span className="font-medium tabular-nums">
                    {usd(r.costMicroUsd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
