import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Shared shell for public legal pages (Terms, Privacy). Styled with the
 * VendGuard warm/terracotta theme tokens so it matches the rest of the app
 * instead of raw greys. Drop the placeholder banner once counsel signs off.
 */
export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 md:py-16">
      <Link
        href="/"
        aria-label="VendGuard home"
        className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo variant="lockup" graphicClassName="h-7" textClassName="h-5" />
      </Link>

      {/* PLACEHOLDER NOTICE — remove before launch. */}
      <div className="mt-8 rounded-lg border border-status-yellow/45 bg-accent px-4 py-3 text-sm text-accent-foreground">
        <strong className="font-semibold">
          Placeholder — not yet legal advice.
        </strong>{" "}
        This draft is written for VendGuard&apos;s product and must be reviewed
        and finalized by a qualified attorney before launch. Bracketed values
        like{" "}
        <code className="rounded bg-background/70 px-1 py-0.5 text-[0.85em]">
          [Effective Date]
        </code>{" "}
        still need to be filled in.
      </div>

      <header className="mt-10 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {lastUpdated}
        </p>
      </header>

      {intro ? (
        <div className="mt-8 text-[0.95rem] leading-7 text-muted-foreground">
          {intro}
        </div>
      ) : null}

      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

/** One numbered/titled section of a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      <div className="space-y-3 text-[0.95rem] leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list styled for legal copy. */
export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5 marker:text-muted-foreground/50">
      {children}
    </ul>
  );
}

/** Inline emphasis that reads as foreground weight within muted body text. */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

/** Inline link styled with the brand accent. */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-brand-ink underline underline-offset-2 hover:text-brand-ink/80"
    >
      {children}
    </Link>
  );
}
