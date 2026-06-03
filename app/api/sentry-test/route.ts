// THROWAWAY — delete after verifying Sentry. Server-side throw, bypasses any
// browser ad-blocker so we can confirm the SDK + DSN actually deliver.
export const runtime = "nodejs";

export async function GET() {
  throw new Error("Sentry SERVER test — delete me");
}
