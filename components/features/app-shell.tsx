"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Warehouse,
  MapPin,
  Users,
  FileCheck2,
  BookOpen,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
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
    { href: "/commissaries", label: "Commissaries", icon: <Warehouse /> },
    { href: "/venues", label: "Venues", icon: <MapPin /> },
    { href: "/people", label: "People", icon: <Users /> },
    { href: "/items", label: "Items", icon: <FileCheck2 /> },
    { href: "/digest", label: "Inspection prep", icon: <BookOpen /> },
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
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all [&_svg]:size-4 [&_svg]:transition-colors",
              active
                ? "bg-primary/10 text-foreground [&_svg]:text-primary"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col gap-8 p-5">
      <div className="space-y-1 px-2 pt-1">
        <Logo variant="lockup" graphicClassName="h-7" textClassName="h-5" />
        <p className="truncate pl-9 text-xs text-muted-foreground">
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
      <aside className="hidden w-60 shrink-0 border-r border-border/70 bg-secondary/40 md:block">
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
          <Logo variant="lockup" graphicClassName="h-6" textClassName="h-4" />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
