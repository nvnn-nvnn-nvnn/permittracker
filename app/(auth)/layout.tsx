import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-secondary/30 px-4 py-10">
      <Link href="/" aria-label="VendGuard home" className="mb-8">
        <Logo variant="lockup" graphicClassName="h-9" textClassName="h-6" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        Stay open. We track every permit, inspection, cert, and COI that can
        shut you down.
      </p>
    </div>
  );
}
