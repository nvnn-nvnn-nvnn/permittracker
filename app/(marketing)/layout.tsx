import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";

/**
 * Public-facing layout (landing + legal pages). Adds the shared site footer
 * so Terms/Privacy are reachable from anywhere on the marketing surface.
 */
export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {children}
      <SiteFooter />
    </div>
  );
}
