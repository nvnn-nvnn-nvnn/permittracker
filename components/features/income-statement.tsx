import { Card, CardContent } from "@/components/ui/card";
import { fmtMoneyCents } from "@/lib/format";
import type { PnlResult } from "@/lib/ops/pnl";

/**
 * Multi-step income statement over the trailing P&L totals.
 *
 * Lines reconcile to how sales are stored (see lib/square/sync.ts):
 *   Net sales      = Gross sales − Refunds
 *   Gross profit   = Net sales − Food cost (COGS)
 *   Operating inc. = Gross profit − Overhead (operating expenses)
 *
 * Discounts are already reflected in gross sales, so they show as an
 * informational memo rather than a deducted line. Tax and tips are
 * pass-through (not revenue) and are intentionally excluded.
 */
export function IncomeStatement({
  totals,
  periodCount,
  noun,
  scopeName,
}: {
  totals: PnlResult["totals"];
  periodCount: number;
  noun: string;
  scopeName: string;
}) {
  const grossMarginPct =
    totals.netSalesCents > 0
      ? Math.round((totals.grossProfitCents / totals.netSalesCents) * 100)
      : null;
  const operatingMarginPct =
    totals.netSalesCents > 0
      ? Math.round((totals.operatingProfitCents / totals.netSalesCents) * 100)
      : null;
  const profitable = totals.operatingProfitCents >= 0;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="text-base font-semibold tracking-tight">
            Income statement
          </h3>
          <p className="text-xs text-muted-foreground">
            {scopeName} · last {periodCount} {noun}
            {periodCount === 1 ? "" : "s"}
          </p>
        </div>

        <dl className="text-sm">
          {/* Revenue */}
          <SectionLabel>Revenue</SectionLabel>
          <Line label="Gross sales" value={totals.grossSalesCents} />
          <Line
            label="Less: Refunds"
            value={-totals.refundsCents}
            muted
            negParen
          />
          <Subtotal label="Net sales" value={totals.netSalesCents} />

          {/* COGS */}
          <SectionLabel className="pt-3">Cost of goods sold</SectionLabel>
          <Line
            label="Food cost (supplier purchases)"
            value={-totals.foodCostCents}
            muted
            negParen
          />
          <Subtotal
            label="Gross profit"
            value={totals.grossProfitCents}
            pct={grossMarginPct}
            pctLabel="gross margin"
          />

          {/* Operating expenses */}
          <SectionLabel className="pt-3">Operating expenses</SectionLabel>
          <Line
            label="Overhead"
            value={-totals.overheadCents}
            muted
            negParen
          />

          {/* Bottom line */}
          <div className="mt-3 flex items-baseline justify-between border-t-2 border-foreground/80 pt-3">
            <dt className="font-semibold">Net operating income</dt>
            <dd
              className={`text-right text-lg font-semibold tabular-nums ${
                profitable ? "text-status-green" : "text-status-red"
              }`}
            >
              {fmtMoneyCents(totals.operatingProfitCents)}
              {operatingMarginPct !== null && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  {operatingMarginPct}% margin
                </span>
              )}
            </dd>
          </div>
        </dl>

        {totals.discountsCents > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Memo: {fmtMoneyCents(totals.discountsCents)} in discounts already
            reflected in gross sales. Sales tax and tips are pass-through and
            excluded.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </p>
  );
}

function Line({
  label,
  value,
  muted = false,
  negParen = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
  negParen?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {fmtAmount(value, negParen)}
      </dd>
    </div>
  );
}

function Subtotal({
  label,
  value,
  pct,
  pctLabel,
}: {
  label: string;
  value: number;
  pct?: number | null;
  pctLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-t border-border py-1.5">
      <dt className="font-medium">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">
        {fmtMoneyCents(value)}
        {pct !== null && pct !== undefined && (
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {pct}% {pctLabel}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Format a signed amount; negatives in accounting parens when requested. */
function fmtAmount(cents: number, negParen: boolean): string {
  if (negParen && cents < 0) return `(${fmtMoneyCents(Math.abs(cents))})`;
  return fmtMoneyCents(cents);
}
