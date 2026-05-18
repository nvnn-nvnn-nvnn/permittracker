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

export const metadata = { title: "Settings · PermitKeep" };

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
