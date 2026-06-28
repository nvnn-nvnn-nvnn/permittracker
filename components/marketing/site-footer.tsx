import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { href: "/#features", label: "Features" },
        { href: "/#how", label: "How it works" },
        { href: "/pricing", label: "Pricing" },
        { href: "/signup", label: "Get started" },
      ],
    },
    {
      heading: "Company",
      links: [
        { href: "/about", label: "About" },
        { href: "/contact", label: "Contact" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { href: "/legal/terms", label: "Terms of Service" },
        { href: "/privacy", label: "Privacy Policy" },
      ],
    },
  ];

/** Public site footer — shown on all marketing + legal pages via the layout. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo variant="lockup" graphicClassName="h-7" textClassName="h-5" />
            <p className="mt-4 text-sm text-muted-foreground">
              Stay open and stay profitable. CartLedger tracks the permits and
              COIs that can shut your food truck down — and turns your Square
              sales into inventory, food cost, and a weekly P&amp;L.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CartLedger. All rights reserved.</p>
          <p className="text-xs">
            An operations &amp; compliance tool — not legal, tax, accounting, or
            insurance advice.
          </p>
          <p>1.1.0</p>
        </div>
      </div>
    </footer>
  );
}
