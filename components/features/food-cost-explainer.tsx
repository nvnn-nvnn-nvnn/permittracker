import Link from "next/link";

/**
 * Plain-English explainer of the three food-cost figures the app shows, so
 * the different numbers never read as a bug. Collapsible — low-clutter.
 */
export function FoodCostExplainer() {
  return (
    <details className="group rounded-lg border border-border/70 bg-secondary/30 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
        How is food cost calculated? (3 views)
        <span className="text-xs text-muted-foreground group-open:hidden">
          Show
        </span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">
          Hide
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          We show food cost three ways because each answers a different
          question — they&apos;re meant to differ:
        </p>
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-foreground">
              1. P&amp;L food cost = supplier purchases received.
            </span>{" "}
            Actual cash out (from{" "}
            <Link href="/purchasing" className="text-brand-ink hover:underline">
              purchasing
            </Link>
            ), bucketed by received date. This drives the profit line. Lumpy
            week-to-week, so watch the trailing food-cost %.
          </li>
          <li>
            <span className="font-medium text-foreground">
              2. Theoretical usage = recipes × items sold.
            </span>{" "}
            What your{" "}
            <Link href="/recipes" className="text-brand-ink hover:underline">
              recipes
            </Link>{" "}
            say you used, valued at ingredient cost — it&apos;s what
            auto-deducts from on-hand. See{" "}
            <Link
              href="/inventory/usage"
              className="text-brand-ink hover:underline"
            >
              Inventory → Usage
            </Link>
            .
          </li>
          <li>
            <span className="font-medium text-foreground">
              3. Actual = opening + purchases − closing.
            </span>{" "}
            The truth, from two{" "}
            <Link
              href="/inventory/counts"
              className="text-brand-ink hover:underline"
            >
              inventory counts
            </Link>{" "}
            — it captures waste &amp; shrink. Needs 2 counts of the same truck.
          </li>
        </ul>
        <p>
          The gap between <strong>#2 (theoretical)</strong> and{" "}
          <strong>#3 (actual)</strong> is your shrink — that&apos;s where money
          quietly leaks.
        </p>
      </div>
    </details>
  );
}
