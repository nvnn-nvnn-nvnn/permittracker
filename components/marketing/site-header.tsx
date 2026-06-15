import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Public marketing top nav. Sticky, with auth-aware CTA. */
export async function SiteHeader() {
  const user = await getAuthUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-6">
        <Link href="/" aria-label="VendGuard home" className="shrink-0">
          <Logo variant="lockup" graphicClassName="h-9" textClassName="h-6" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className={buttonVariants({ size: "sm" })}
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({
                  size: "sm",
                  variant: "ghost",
                  className: "hidden sm:inline-flex",
                })}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className={buttonVariants({ size: "sm" })}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
