import Link from "next/link";
import {
  CalendarClock,
  ScanLine,
  ShieldCheck,
  Bell,
  Users,
  FileText,
  ArrowRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "VendGuard — Stay open. Never miss a permit.",
  description:
    "Compliance tracking for food trucks. Track every permit, inspection, cert, and COI that can shut you down — and get reminded before it lapses.",
};

const FEATURES = [
  {
    icon: FileText,
    title: "One timeline for everything",
    body: "Permits, inspections, certifications, COIs, and commissary agreements — every expiry date in one place, per truck.",
  },
  {
    icon: Bell,
    title: "Reminders before expiry",
    body: "Get warned by email well before anything lapses, with SMS and voice escalation on higher plans. No more surprise shutdowns.",
  },
  {
    icon: ScanLine,
    title: "Scan a document, we file it",
    body: "Upload a permit photo and our AI reads the dates and details for you to confirm — no manual data entry.",
  },
  {
    icon: Users,
    title: "Staff & commissary cascades",
    body: "An expired staff cert or a lapsed commissary permit flags every truck it affects — so nothing slips through a side door.",
  },
  {
    icon: CalendarClock,
    title: "Inspection-prep digests",
    body: "Monthly, jurisdiction-aware prep notes so a surprise health inspection is never actually a surprise.",
  },
  {
    icon: ShieldCheck,
    title: "Audit-ready history",
    body: "Every change is recorded in an append-only log. Prove what changed, and when, without lifting a finger.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Add your trucks",
    body: "Create a profile for each truck, cart, or trailer you operate.",
  },
  {
    n: "02",
    title: "Add or scan your documents",
    body: "Type them in, or upload a photo and let the AI pull the dates.",
  },
  {
    n: "03",
    title: "Relax — we watch the dates",
    body: "We remind you before anything expires, so you stay open and compliant.",
  },
];

export default function MarketingHome() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Compliance for mobile food businesses
            </span>
            <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              Stay open.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
              VendGuard tracks every permit, inspection, cert, and COI that can
              shut your food truck down — and reminds you before it does.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className={buttonVariants({ size: "lg" })}
              >
                Start free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required · Set up in minutes
            </p>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-5 py-8 text-center sm:px-6">
          <p className="text-sm font-medium text-muted-foreground">
            Built for the things that actually shut trucks down
          </p>
          <p className="text-pretty text-base font-medium">
            Health permits · Fire &amp; hood inspections · Food-handler cards ·
            General liability COIs · Commissary agreements · Vehicle
            registration
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything that can close you down, in one place
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Stop juggling glove-box folders, inbox reminders, and sticky
              notes. VendGuard keeps the whole picture current.
            </p>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col">
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-pretty text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-border/60 bg-secondary/30">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in an afternoon
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              No consultants, no spreadsheets. Three steps and you&apos;re
              covered.
            </p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-border bg-card p-7"
              >
                <span className="text-sm font-bold tracking-widest text-primary">
                  {s.n}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote / placeholder testimonial */}
      <section>
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-6 sm:py-24">
          <blockquote className="text-balance text-2xl font-medium leading-snug sm:text-3xl">
            “I used to find out a permit lapsed when an inspector told me.
            Now I find out a month early, from my phone.”
          </blockquote>
          <p className="mt-6 text-sm font-medium text-muted-foreground">
            — Placeholder Operator, Twin Cities food truck
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
          <div className="rounded-3xl border border-border bg-card px-6 py-14 text-center sm:px-12">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Keep your truck open this season
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Start tracking the permits, inspections, and COIs that matter —
              free to begin.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                Start free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/contact"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
