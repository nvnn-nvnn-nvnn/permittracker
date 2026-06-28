import { serverApi } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QuickBooksExport } from "@/components/features/quickbooks-export";

export const metadata = { title: "QuickBooks export · CartLedger" };
export const dynamic = "force-dynamic";

export default async function QuickBooksExportPage() {
  const api = await serverApi();
  const { liveSyncConfigured } = await api.ops.quickbooksStatus();

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          QuickBooks
          {liveSyncConfigured ? (
            <Badge variant="green">Connected</Badge>
          ) : (
            <Badge variant="outline">Export only</Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          Send your books to QuickBooks. Download a transactions CSV now; live
          sync arrives once your QuickBooks account is connected.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium">Export transactions</p>
            <p className="text-xs text-muted-foreground">
              Sales (income) and expenses (money out) as a 4-column CSV —
              QuickBooks imports it under Transactions → Import.
            </p>
          </div>
          <QuickBooksExport />
        </CardContent>
      </Card>

      {!liveSyncConfigured && (
        <p className="text-xs text-muted-foreground">
          Live two-way sync (auto-posting sales receipts and expenses to
          QuickBooks Online) is coming. Until then, the CSV export keeps your
          books current with a quick monthly import.
        </p>
      )}
    </div>
  );
}
