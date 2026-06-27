import type { ReactNode } from "react";
import { requireAccountContext } from "@/lib/auth/session";
import { accountHasOperations } from "@/lib/limits";
import { AppShell } from "@/components/features/app-shell";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireAccountContext();
  const operationsEnabled = await accountHasOperations(ctx.accountId);
  return (
    <AppShell
      accountName={ctx.accountName}
      userEmail={ctx.email}
      isPlatformAdmin={ctx.isPlatformAdmin}
      operationsEnabled={operationsEnabled}
    >
      {children}
    </AppShell>
  );
}
