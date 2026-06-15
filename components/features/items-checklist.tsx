import Link from "next/link";
import { Check, Plus } from "lucide-react";
import {
  CHECKLIST,
  TIER_BLURB,
  TIER_LABEL,
  isChecklistEntrySatisfied,
  type ChecklistTier,
} from "@/lib/checklist";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ComplianceItem } from "@/lib/db/schema";

const TIER_ORDER: ChecklistTier[] = ["essential", "recommended", "situational"];

export function ItemsChecklist({ items }: { items: ComplianceItem[] }) {
  const matchable = items
    .filter((i) => !i.archivedAt)
    .map((i) => ({
      itemType: i.itemType,
      subtype: i.subtype,
      identifier: i.identifier,
    }));

  const rows = CHECKLIST.map((entry) => ({
    entry,
    done: isChecklistEntrySatisfied(entry, matchable),
  }));

  const total = rows.length;
  const done = rows.filter((r) => r.done).length;
  const essentialRows = rows.filter((r) => r.entry.tier === "essential");
  const essentialDone = essentialRows.filter((r) => r.done).length;
  const essentialTotal = essentialRows.length;
  const allEssentialDone = essentialDone === essentialTotal;

  return (
    <Card>
      <CardContent className="p-0">
        <details open={!allEssentialDone} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Common compliance items for food trucks
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {done}/{total} tracked
                {essentialTotal > 0 &&
                  ` · ${essentialDone}/${essentialTotal} essentials`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {allEssentialDone && essentialTotal > 0 && (
                <Badge variant="green" className="gap-1">
                  <Check className="size-3" /> Essentials covered
                </Badge>
              )}
              <span className="text-xs text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">
                Hide
              </span>
            </div>
          </summary>

          <div className="space-y-6 border-t px-5 py-5">
            {TIER_ORDER.map((tier) => {
              const group = rows.filter((r) => r.entry.tier === tier);
              if (group.length === 0) return null;
              return (
                <section key={tier} className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {TIER_LABEL[tier]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TIER_BLURB[tier]}
                    </p>
                  </div>
                  <ul className="divide-y divide-border/70 rounded-md border">
                    {group.map(({ entry, done: isDone }) => (
                      <li
                        key={entry.id}
                        className="flex items-center gap-3 px-3 py-3"
                      >
                        <span
                          aria-hidden
                          className={
                            isDone
                              ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-status-green text-white"
                              : "size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/40"
                          }
                        >
                          {isDone && <Check className="size-3" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={
                              "truncate text-sm font-medium" +
                              (isDone
                                ? " text-muted-foreground line-through"
                                : "")
                            }
                          >
                            {entry.title}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        </div>
                        <Link
                          href={prefillUrl(entry.itemType, entry.subtype)}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
                        >
                          <Plus className="size-3.5" />
                          {isDone ? "Add another" : "Add"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function prefillUrl(type: string, subtype: string): string {
  const params = new URLSearchParams({ type, subtype });
  return `/items/new?${params.toString()}`;
}
