"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  FileCheck2,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface AppShellProps {
  children: ReactNode;
  accountName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
}

export function AppShell({
  children,
  accountName,
  userEmail,
  isPlatformAdmin,
}: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
    { href: "/trucks", label: "Trucks", icon: <Truck /> },
    { href: "/items", label: "Items", icon: <FileCheck2 /> },
    { href: "/settings", label: "Settings", icon: <Settings /> },
  ];
  if (isPlatformAdmin) {
    nav.push({ href: "/admin", label: "Admin", icon: <ShieldCheck /> });
  }

  const navList = (
    <nav className="flex flex-col gap-1.5">
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col gap-8 p-5">
      <div className="space-y-0.5 px-3 pt-1">
        <p className="text-base font-semibold tracking-tight">
          Permit<span className="text-status-green">Keep</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {accountName}
        </p>
      </div>
      {navList}
      <div className="mt-auto space-y-2 border-t pt-4">
        <p className="truncate px-3 text-xs text-muted-foreground">
          {userEmail}
        </p>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r md:block">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-background shadow-lg">
            {sidebarInner}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
          <span className="text-sm font-semibold">
            Permit<span className="text-status-green">Keep</span>
          </span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
