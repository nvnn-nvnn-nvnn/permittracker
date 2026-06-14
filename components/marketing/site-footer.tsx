import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Public site footer — shown on marketing + legal pages via (marketing) layout. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Logo variant="graphic" graphicClassName="h-6" />
          <span>
            © {new Date().getFullYear()} VendGuard · Stay open.
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <a
            href="mailto:support@vendguard.app"
            className="hover:text-foreground"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
