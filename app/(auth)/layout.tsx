import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link
        href="/"
        className="mb-8 text-lg font-semibold tracking-tight"
      >
        Permit<span className="text-status-green">Keep</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        Stay open. We track every permit, inspection, cert, and COI that can
        shut you down.
      </p>
    </div>
  );
}
