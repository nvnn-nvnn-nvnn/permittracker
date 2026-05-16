import { requireAccountContext } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Dashboard · PermitKeep" };

export default async function DashboardPage() {
  const ctx = await requireAccountContext();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.accountName} · plan: {ctx.planTier} · role: {ctx.role}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Compliance status</CardTitle>
          <CardDescription>
            GREEN / YELLOW / RED is computed server-side from your compliance
            items. Add trucks and items in Phase 2 to light this up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center gap-2 rounded-full bg-status-green/15 px-3 py-1 text-sm font-medium text-status-green">
            <span className="size-2 rounded-full bg-status-green" />
            GREEN — nothing tracked yet
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
