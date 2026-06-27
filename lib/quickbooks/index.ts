import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * QuickBooks adapter (Operations pillar, Slice 4).
 *
 * Slice 4 ships the **CSV export** as the working deliverable (no creds needed).
 * Live push to QuickBooks Online is OAuth2 + entity mapping (SalesReceipt /
 * Purchase) and can't be exercised without a QBO dev app + sandbox, so it's
 * stubbed behind this adapter — same posture as Square/Twilio. Wiring the real
 * REST calls is future work; call sites only import `getQuickBooksAdapter()`.
 */
export interface QuickBooksTxn {
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  /** Positive = income, negative = expense. */
  amountCents: number;
}

export interface QuickBooksAdapter {
  /** Push a batch of transactions. Stub logs; real impl posts to QBO. */
  pushTransactions(txns: QuickBooksTxn[]): Promise<{ pushed: number }>;
}

const noopQuickBooksAdapter: QuickBooksAdapter = {
  async pushTransactions(txns) {
    console.warn(
      `[quickbooks:stub] would push ${txns.length} transactions to QuickBooks`,
    );
    return { pushed: txns.length };
  },
};

let _adapter: QuickBooksAdapter | null = null;
export function getQuickBooksAdapter(): QuickBooksAdapter {
  if (_adapter) return _adapter;
  // Real REST adapter is future work; always the no-op stub for now.
  _adapter = noopQuickBooksAdapter;
  return _adapter;
}

/** True when QuickBooks OAuth creds are present (gates live-sync UI). */
export function isQuickBooksConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.QUICKBOOKS_ACCESS_TOKEN && env.QUICKBOOKS_REALM_ID);
}
