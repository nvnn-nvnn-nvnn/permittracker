import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { serverApi } from "@/lib/trpc/server";
import { itemTypeValues } from "@/lib/validators";
import { classifyItem } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import { TYPE_LABEL, TYPE_ICON } from "@/lib/item-display";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { ComplianceItem, ItemType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Variant = "red" | "yellow" | "green" | "outline";
const RANK: Record<Variant, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  outline: 3,
};

function byUrgency(a: ComplianceItem, b: ComplianceItem): number {
  const ca = classifyItem(a);
  const cb = classifyItem(b);
  const r = RANK[ca.variant] - RANK[cb.variant];
  if (r !== 0) return r;
  return (
    (ca.daysToExpiry ?? Number.MAX_SAFE_INTEGER) -
    (cb.daysToExpiry ?? Number.MAX_SAFE_INTEGER)
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const label = TYPE_LABEL[type as ItemType] ?? "Items";
  return { title: `${label} · VendGuard` };
}

export default async function ItemCategoryPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!(itemTypeValues as readonly string[]).includes(type)) notFound();
  const itemType = type as ItemType;
  const Icon = TYPE_ICON[itemType];

  const api = await serverApi();
  const [items, trucks] = await Promise.all([
    api.item.list(),
    api.truck.list({ includeArchived: true }),
  ]);
  const truckName = new Map(trucks.map((t) => [t.id, t.name]));
  const group = items
    .filter((i) => i.itemType === itemType)
    .sort(byUrgency);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/items"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ChevronLeft className="size-4" />
          All items
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon className="size-6 shrink-0 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              {TYPE_LABEL[itemType]}
            </h1>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-semibold tabular-nums text-secondary-foreground">
              {group.length}
            </span>
          </div>
          <Link
            href={`/items/new?type=${itemType}`}
            className={buttonVariants({ size: "sm" })}
          >
            Add {TYPE_LABEL[itemType].toLowerCase().replace(/s$/, "")}
          </Link>
        </div>
      </div>

      {group.length === 0 ? (
        <Card className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
          No {TYPE_LABEL[itemType].toLowerCase()} tracked yet.{" "}
          <Link
            href={`/items/new?type=${itemType}`}
            className="font-semibold text-brand-ink hover:underline"
          >
            Add one
          </Link>
          .
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col divide-y divide-border">
            {group.map((it) => {
              const badge = classifyItem(it);
              const holder = it.holderTruckId
                ? (truckName.get(it.holderTruckId) ?? "Truck")
                : (it.holderName ?? it.holderType);
              return (
                <Link
                  key={it.id}
                  href={`/items/${it.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">
                      {it.subtype ?? it.identifier ?? "Untitled"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {holder} · exp {fmtDate(it.expirationDate)}
                    </span>
                  </div>
                  <Badge
                    variant={badge.variant}
                    className="shrink-0 font-semibold"
                  >
                    {badge.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
