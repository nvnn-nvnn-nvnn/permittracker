import { Suspense } from "react";
import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { BillingPanel } from "@/components/features/billing-panel";
import { NotificationsPanel } from "@/components/features/notifications-panel";

export const metadata = { title: "Settings · VendGuard" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireAccountContext();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Workspace and identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Workspace" value={ctx.accountName} />
          <Row label="Slug" value={ctx.accountSlug} />
          <Row label="Plan" value={ctx.planTier} />
          <Row label="Your email" value={ctx.email} />
          <Row label="Your role" value={ctx.role} />
          <form action={signOut} className="pt-3">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading billing…
            </CardContent>
          </Card>
        }
      >
        <BillingPanel />
      </Suspense>

      <NotificationsPanel />

      <Card>
        <CardHeader>
          <CardTitle>Legal</CardTitle>
          <CardDescription>
            Policies that govern your use of VendGuard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Link
            href="/legal/terms"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Privacy Policy
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>              
    
  );
}
