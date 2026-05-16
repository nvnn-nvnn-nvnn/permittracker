import { notFound } from "next/navigation";
import { requireAccountContext } from "@/lib/auth/session";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin · PermitKeep" };

export default async function AdminPage() {
  const ctx = await requireAccountContext();
  // Role-gated: same app, platform-admin flag only (Phase 9 builds this out).
  if (!ctx.isPlatformAdmin) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>Platform admin</CardTitle>
          <CardDescription>
            Concierge queue, extraction accuracy, cost dashboard, and dispatch
            monitor arrive in Phase 9.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
