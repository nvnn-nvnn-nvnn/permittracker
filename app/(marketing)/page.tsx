import Link from "next/link";
import Image from "next/image";
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
import foodtruckHero from "@/app/assets/foodtruck-2.jpg";
import foodtruckQuote from "@/app/assets/foodtruck-3.jpg";
import foodtruckCta from "@/app/assets/foodtruck-4.jpg";

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
      {/* Hero over a photo */}
      <section className="relative overflow-hidden border-b border-border/60">
        <Image
          src={foodtruckHero}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-foreground/70" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-6 sm:py-28">
          <span className="inline-flex items-center rounded-full border border-background/25 bg-background/10 px-3 py-1 text-xs font-medium text-background/90 backdrop-blur-sm">
            Compliance for mobile food businesses
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight text-background sm:text-7xl">
            Stay open.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-background/85 sm:text-xl">
            VendGuard tracks every permit, inspection, cert, and COI that can
            shut your food truck down — and reminds you before it does.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-background/40 px-8 text-sm font-medium text-background transition-colors hover:bg-background/10"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-background/70">
            No credit card required · Set up in minutes
          </p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1.5 px-5 py-6 text-center sm:px-6">
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
      <section id="features" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything that can close you down, in one place
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Stop juggling glove-box folders, inbox reminders, and sticky
              notes. VendGuard keeps the whole picture current.
            </p>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col">
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-brand-ink shadow-[var(--shadow-soft)]">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-pretty text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="scroll-mt-24 border-y border-border/60 bg-secondary/30"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in an afternoon
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              No consultants, no spreadsheets. Three steps and you&apos;re
              covered.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-pop)]"
              >
                <span className="text-sm font-bold tracking-widest text-brand-ink">
                  {s.n}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote over a photo */}
      <section className="relative overflow-hidden">
        <Image
          src={foodtruckQuote}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          placeholder="blur"
        />
        <div className="absolute inset-0 bg-foreground/70" />
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-6 sm:py-20">
          <blockquote className="text-balance text-2xl font-medium leading-snug text-background sm:text-3xl">
            “I used to find out a permit lapsed when an inspector told me, or when I got the notification in the mail. Now I can keep track of everything, and
            find out a month early, from my phone, and computer. Tracking everything using this software has made managing my permits so much easier, and it sure beats having to use spreadsheets and Google Calendar to automate everything manually”
          </blockquote>
          <p className="mt-5 text-sm font-medium text-background/80">
            — Adrian Hernandez, Peyos Authentic Mexican Cuisine
          </p>
        </div>
      </section>

      {/* Final CTA over a photo */}
      <section className="relative overflow-hidden border-t border-border/60">
        <Image
          src={foodtruckCta}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          placeholder="blur"
        />
        <div className="absolute inset-0 bg-foreground/80" />
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-background sm:text-5xl">
            Keep your truck open — all season long.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-background/85">
            Track the permits, inspections, and COIs that matter, get reminded
            before they lapse, and never lose a weekend to an expired document.
            Free to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-background/40 px-8 text-sm font-medium text-background transition-colors hover:bg-background/10"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
