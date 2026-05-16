import type { ReactNode } from "react";
import { requireAccountContext } from "@/lib/auth/session";
import { AppShell } from "@/components/features/app-shell";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireAccountContext();
  return (
    <AppShell
      accountName={ctx.accountName}
      userEmail={ctx.email}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {children}
    </AppShell>
  );
}
