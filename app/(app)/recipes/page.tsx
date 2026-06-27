import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents } from "@/lib/format";

export const metadata = { title: "Recipes · VendGuard" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const api = await serverApi();
  const recipes = await api.recipe.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
          <p className="text-sm text-muted-foreground">
            Menu items priced against ingredient cost — see your margin per
            item.
          </p>
        </div>
        <Link href="/recipes/new" className={buttonVariants({ size: "sm" })}>
          Add menu item
        </Link>
      </div>

      {recipes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No menu items yet</CardTitle>
            <CardDescription>
              Build a menu item from your inventory ingredients and we&apos;ll
              compute its food cost and margin automatically.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {recipes.map((r) => {
              const margin = r.sellPriceCents - r.cogsCents;
              const pct =
                r.sellPriceCents > 0
                  ? Math.round((margin / r.sellPriceCents) * 100)
                  : null;
              return (
                <Link
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.category ? `${r.category} · ` : ""}
                      {r.lineCount} ingredient{r.lineCount === 1 ? "" : "s"} ·
                      cost {fmtMoneyCents(r.cogsCents)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">
                      {fmtMoneyCents(r.sellPriceCents)}
                    </p>
                    <p
                      className={`text-[11px] tabular-nums ${
                        pct === null
                          ? "text-muted-foreground"
                          : margin < 0
                            ? "text-status-red"
                            : "text-status-green"
                      }`}
                    >
                      {pct === null ? "no price" : `${pct}% margin`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
