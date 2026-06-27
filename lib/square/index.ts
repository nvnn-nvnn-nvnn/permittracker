import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Square adapter (Operations pillar, Slice 1).
 *
 * Real Square via REST (Bearer token, no SDK dependency — same posture as the
 * Twilio SMS adapter) when SQUARE_ACCESS_TOKEN is set; otherwise a deterministic
 * stub that fabricates plausible daily sales so the weekly P&L demos with no
 * credentials. Call sites only import `getSquareAdapter()`.
 *
 * Full OAuth (multi-merchant connect flow + encrypted token storage) is later
 * work; Slice 1 reads a single personal-access / sandbox token from env.
 */

/** One day of aggregated sales. All money in integer cents. */
export interface SquareSalesDay {
  /** YYYY-MM-DD (business date). */
  date: string;
  grossSalesCents: number;
  refundsCents: number;
  taxCents: number;
  tipsCents: number;
  discountsCents: number;
  transactionCount: number;
}

export interface SquareMerchant {
  merchantId: string;
  locationId: string;
  locationName: string;
}

/** One menu item's sales on one day. */
export interface SquareItemSalesDay {
  /** YYYY-MM-DD. */
  date: string;
  itemName: string;
  /** Square catalog object id when available. */
  squareItemId?: string;
  qtySold: number;
  grossSalesCents: number;
}

export interface SquareAdapter {
  /** The linked merchant + the location we pull sales for. */
  getMerchant(): Promise<SquareMerchant>;
  /** Daily sales rollups for [start, end] inclusive (YYYY-MM-DD). */
  listDailySales(input: {
    locationId: string;
    start: string;
    end: string;
  }): Promise<SquareSalesDay[]>;
  /** Per-item daily sales (order line items) for [start, end] inclusive. */
  listItemSales(input: {
    locationId: string;
    start: string;
    end: string;
  }): Promise<SquareItemSalesDay[]>;
}

/** Demo menu used by the stub adapter. */
const STUB_MENU: { name: string; priceCents: number; weight: number }[] = [
  { name: "Smash burger", priceCents: 1100, weight: 0.3 },
  { name: "Loaded fries", priceCents: 700, weight: 0.2 },
  { name: "Chicken tacos (3)", priceCents: 1000, weight: 0.25 },
  { name: "Veggie wrap", priceCents: 900, weight: 0.15 },
  { name: "Fountain soda", priceCents: 300, weight: 0.1 },
];

const SQUARE_VERSION = "2025-01-23";

// --- Stub ------------------------------------------------------------------

/** Deterministic per-date pseudo-randomness so a given day always renders the
 *  same numbers (stable demos, idempotent re-syncs). */
function seeded(dateStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0, 1).
  return ((h >>> 0) % 100000) / 100000;
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const stubSquareAdapter: SquareAdapter = {
  async getMerchant() {
    return {
      merchantId: "stub-merchant",
      locationId: "stub-location",
      locationName: "Demo Truck (sandbox)",
    };
  },
  async listDailySales({ start, end }) {
    return eachDate(start, end).map((date) => {
      const r = seeded(date);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
      // Weekends busier; Mondays slow. Tickets ~ $8–$14.
      const weekendBoost = dow === 5 || dow === 6 ? 1.6 : dow === 1 ? 0.6 : 1;
      const transactionCount = Math.round((40 + r * 90) * weekendBoost);
      const avgTicketCents = Math.round(800 + r * 600);
      const grossSalesCents = transactionCount * avgTicketCents;
      const taxCents = Math.round(grossSalesCents * 0.08);
      const tipsCents = Math.round(grossSalesCents * (0.05 + r * 0.1));
      const discountsCents = Math.round(grossSalesCents * (r * 0.04));
      const refundsCents = r > 0.85 ? Math.round(avgTicketCents * (1 + r * 3)) : 0;
      return {
        date,
        grossSalesCents,
        refundsCents,
        taxCents,
        tipsCents,
        discountsCents,
        transactionCount,
      };
    });
  },
  async listItemSales({ start, end }) {
    const out: SquareItemSalesDay[] = [];
    for (const date of eachDate(start, end)) {
      const r = seeded(date);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekendBoost = dow === 5 || dow === 6 ? 1.6 : dow === 1 ? 0.6 : 1;
      const transactionCount = Math.round((40 + r * 90) * weekendBoost);
      for (const m of STUB_MENU) {
        const qtySold = Math.round(transactionCount * m.weight);
        if (qtySold <= 0) continue;
        out.push({
          date,
          itemName: m.name,
          qtySold,
          grossSalesCents: qtySold * m.priceCents,
        });
      }
    }
    return out;
  },
};

// --- Real (REST) -----------------------------------------------------------

function baseUrl(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

interface SquareMoney {
  amount?: number | string;
  currency?: string;
}
function cents(m: SquareMoney | undefined): number {
  if (!m?.amount) return 0;
  // Square returns the smallest currency unit (cents) as an integer.
  return typeof m.amount === "string" ? parseInt(m.amount, 10) || 0 : m.amount;
}

function realSquareAdapter(
  token: string,
  environment: "sandbox" | "production",
  pinnedLocationId: string | undefined,
): SquareAdapter {
  const root = baseUrl(environment);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };

  return {
    async getMerchant() {
      const res = await fetch(`${root}/v2/locations`, { headers });
      if (!res.ok) {
        throw new Error(`Square locations ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as {
        locations?: Array<{
          id: string;
          name?: string;
          merchant_id?: string;
        }>;
      };
      const locations = json.locations ?? [];
      const loc =
        (pinnedLocationId &&
          locations.find((l) => l.id === pinnedLocationId)) ||
        locations[0];
      if (!loc) throw new Error("Square: no locations on this account");
      return {
        merchantId: loc.merchant_id ?? "unknown",
        locationId: loc.id,
        locationName: loc.name ?? loc.id,
      };
    },

    async listDailySales({ locationId, start, end }) {
      // Aggregate completed orders into per-day buckets. Square paginates via
      // `cursor`; we follow it until exhausted.
      const buckets = new Map<string, SquareSalesDay>();
      const ensure = (date: string): SquareSalesDay => {
        let b = buckets.get(date);
        if (!b) {
          b = {
            date,
            grossSalesCents: 0,
            refundsCents: 0,
            taxCents: 0,
            tipsCents: 0,
            discountsCents: 0,
            transactionCount: 0,
          };
          buckets.set(date, b);
        }
        return b;
      };

      let cursor: string | undefined;
      do {
        const body = {
          location_ids: [locationId],
          cursor,
          query: {
            filter: {
              date_time_filter: {
                closed_at: {
                  start_at: `${start}T00:00:00Z`,
                  end_at: `${end}T23:59:59Z`,
                },
              },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
        };
        const res = await fetch(`${root}/v2/orders/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Square orders ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json()) as {
          cursor?: string;
          orders?: Array<{
            closed_at?: string;
            created_at?: string;
            total_money?: SquareMoney;
            total_tax_money?: SquareMoney;
            total_tip_money?: SquareMoney;
            total_discount_money?: SquareMoney;
            return_amounts?: { total_money?: SquareMoney };
          }>;
        };
        for (const o of json.orders ?? []) {
          const when = o.closed_at ?? o.created_at;
          if (!when) continue;
          const b = ensure(when.slice(0, 10));
          b.grossSalesCents += cents(o.total_money);
          b.taxCents += cents(o.total_tax_money);
          b.tipsCents += cents(o.total_tip_money);
          b.discountsCents += cents(o.total_discount_money);
          b.refundsCents += cents(o.return_amounts?.total_money);
          b.transactionCount += 1;
        }
        cursor = json.cursor;
      } while (cursor);

      return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
    },

    async listItemSales({ locationId, start, end }) {
      // Same order search, but aggregate line items by (day, item name).
      const buckets = new Map<string, SquareItemSalesDay>();
      let cursor: string | undefined;
      do {
        const body = {
          location_ids: [locationId],
          cursor,
          query: {
            filter: {
              date_time_filter: {
                closed_at: {
                  start_at: `${start}T00:00:00Z`,
                  end_at: `${end}T23:59:59Z`,
                },
              },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
        };
        const res = await fetch(`${root}/v2/orders/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Square orders ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json()) as {
          cursor?: string;
          orders?: Array<{
            closed_at?: string;
            created_at?: string;
            line_items?: Array<{
              name?: string;
              quantity?: string;
              catalog_object_id?: string;
              gross_sales_money?: SquareMoney;
              total_money?: SquareMoney;
            }>;
          }>;
        };
        for (const o of json.orders ?? []) {
          const when = o.closed_at ?? o.created_at;
          if (!when) continue;
          const day = when.slice(0, 10);
          for (const li of o.line_items ?? []) {
            const itemName = li.name ?? "Unnamed item";
            const key = `${day}|${itemName}`;
            let b = buckets.get(key);
            if (!b) {
              b = {
                date: day,
                itemName,
                squareItemId: li.catalog_object_id,
                qtySold: 0,
                grossSalesCents: 0,
              };
              buckets.set(key, b);
            }
            b.qtySold += parseFloat(li.quantity ?? "0") || 0;
            b.grossSalesCents += cents(li.gross_sales_money ?? li.total_money);
          }
        }
        cursor = json.cursor;
      } while (cursor);

      return [...buckets.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    },
  };
}

let _adapter: SquareAdapter | null = null;
export function getSquareAdapter(): SquareAdapter {
  if (_adapter) return _adapter;
  const env = serverEnv();
  _adapter = env.SQUARE_ACCESS_TOKEN
    ? realSquareAdapter(
        env.SQUARE_ACCESS_TOKEN,
        env.SQUARE_ENVIRONMENT,
        env.SQUARE_LOCATION_ID,
      )
    : stubSquareAdapter;
  return _adapter;
}

/** True when a real Square token is configured (vs. the demo stub). */
export function isSquareConfigured(): boolean {
  return Boolean(serverEnv().SQUARE_ACCESS_TOKEN);
}
