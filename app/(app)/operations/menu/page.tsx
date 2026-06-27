import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents } from "@/lib/format";
import type { MenuClass } from "@/lib/ops/menu";

export const metadata = { title: "Menu analysis · VendGuard" };
export const dynamic = "force-dynamic";

const CLASS_META: Record<
  MenuClass,
  { label: string; variant: "green" | "yellow" | "red" | "outline" }
> = {
  star: { label: "Star", variant: "green" },
  plowhorse: { label: "Plowhorse", variant: "yellow" },
  puzzle: { label: "Puzzle", variant: "outline" },
  dog: { label: "Dog", variant: "red" },
};

export default async function MenuAnalysisPage() {
  const api = await serverApi();
  const result = await api.ops.menuAnalysis({ days: 30 });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Menu analysis
        </h1>
        <p className="text-sm text-muted-foreground">
          Last 30 days · each item ranked by how much it sells and how much it
          makes. Matches Square sales to your recipe costs.
        </p>
      </div>

      {!result.hasData ? (
        <Card>
          <CardHeader>
            <CardTitle>Not enough data yet</CardTitle>
            <CardDescription>
              Sync Square sales on the{" "}
              <Link href="/operations" className="text-brand-ink hover:underline">
                Operations
              </Link>{" "}
              page and add{" "}
              <Link href="/recipes" className="text-brand-ink hover:underline">
                recipes
              </Link>{" "}
              that match your menu item names — then we can cost and classify
              each one.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {result.matched.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                You have sales but none of the item names match a recipe yet.
                Name your{" "}
                <Link
                  href="/recipes"
                  className="text-brand-ink hover:underline"
                >
                  recipes
                </Link>{" "}
                the same as your POS items to unlock margins.
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="divide-y">
                {result.matched.map((m) => {
                  const meta = CLASS_META[m.klass];
                  return (
                    <div key={m.itemName} className="px-4 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 truncate font-medium">
                          {m.itemName}
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </p>
                        <p className="shrink-0 text-right text-sm">
                          <span className="font-medium tabular-nums">
                            {fmtMoneyCents(m.totalProfitCents)}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            profit
                          </span>
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {m.unitsSold.toLocaleString("en-US")} sold
                        </span>
                        <span className="tabular-nums">
                          {fmtMoneyCents(m.marginCents)} margin
                          {m.marginPct !== null ? ` (${m.marginPct}%)` : ""}
                        </span>
                        <span className="tabular-nums">
                          {fmtMoneyCents(m.sellPriceCents)} price ·{" "}
                          {fmtMoneyCents(m.cogsCents)} cost
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/80">
                        {m.recommendation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {result.unmatched.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Sold, but no recipe yet
              </h2>
              <Card className="overflow-hidden p-0">
                <div className="divide-y">
                  {result.unmatched.map((u) => (
                    <div
                      key={u.itemName}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="truncate">{u.itemName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {u.unitsSold.toLocaleString("en-US")} sold ·{" "}
                        {fmtMoneyCents(u.grossSalesCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <p className="text-xs text-muted-foreground">
                Add a{" "}
                <Link href="/recipes" className="text-brand-ink hover:underline">
                  recipe
                </Link>{" "}
                named exactly like each item to include it in the analysis.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Stars sell well and earn well — feature them. Plowhorses are popular
            but low-margin (raise price / cut cost). Puzzles earn well but sell
            slowly (promote them). Dogs do neither — candidates to cut.
          </p>
        </>
      )}
    </div>
  );
}
