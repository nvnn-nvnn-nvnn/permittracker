import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";

export default async function MarketingHome() {
  const user = await getAuthUser();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium text-status-green">PermitKeep</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          Stay open.
        </h1>
        <p className="text-base text-muted-foreground">
          We track every permit, inspection, cert, and COI that can shut your
          food truck down — and remind you before it does.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {user ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/signup" className={buttonVariants()}>
              Get started
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline" })}
            >
              Sign in
            </Link>
          </>
        )}
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>• Permits, inspections, certs, COIs — one timeline</li>
        <li>• Reminders by email, SMS, and voice before expiry</li>
        <li>• Forward renewal notices straight to your inbox address</li>
      </ul>
    </main>
  );
}
