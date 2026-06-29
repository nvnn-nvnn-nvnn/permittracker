import Link from "next/link";
import Image from "next/image";
import {
  ScanLine,
  ListChecks,
  FileText,
  TrendingUp,
  Boxes,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import foodtruckHero from "@/app/assets/foodtruck-2.jpg";
import foodtruckQuote from "@/app/assets/foodtruck-3.jpg";
import foodtruckCta from "@/app/assets/foodtruck-4.jpg";

export const metadata = {
  title: "CartLedger — Automated tracking & financials for food trucks.",
  description:
    "CartLedger turns your Square sales into income, expenses, inventory, and profit automatically — and keeps a running checklist of what needs you next, from low-stock reorders to expiring permits. Your money and your paperwork, tracked in one place.",
};

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Income, expenses & profit — automatic",
    body: "Connect Square and CartLedger builds your P&L by day, week, or month: net sales, food cost, and profit, on a clear chart — no spreadsheet.",
  },
  {
    icon: ListChecks,
    title: "A checklist that builds itself",
    body: "CartLedger surfaces what needs you next — low stock to reorder, fees due, permits about to expire — so nothing slips, on the money side or the compliance side.",
  },
  {
    icon: Boxes,
    title: "Inventory that tracks itself",
    body: "Sales auto-deplete ingredients through your recipes, so you always know what's on hand, what it cost, and what to reorder.",
  },
  {
    icon: Receipt,
    title: "Know what actually makes money",
    body: "Per-item margins, your food-cost %, and which menu items to push or drop — straight from your real sales. Export clean books to QuickBooks.",
  },
  {
    icon: FileText,
    title: "Compliance, tracked too",
    body: "Permits, inspections, certs, COIs, and commissary agreements — every expiry in one timeline, per truck, so a lapse never shuts you down.",
  },
  {
    icon: ScanLine,
    title: "Scan a document, we file it",
    body: "Snap a permit or invoice and our AI reads the dates and details for you to confirm — no manual data entry.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect Square & add your trucks",
    body: "Link your POS and create a profile per truck; scan permits or type them in.",
  },
  {
    n: "02",
    title: "CartLedger tracks it automatically",
    body: "Sales flow in and become inventory usage, food cost, and a live P&L — per truck, no spreadsheets.",
  },
  {
    n: "03",
    title: "Follow the checklist",
    body: "It tells you what needs you next — reorders, fees, renewals — so you stay open and in the black.",
  },
];

export default function MarketingHome() {
  return (
    <main>
      {/* Beta ribbon */}
      <div className="bg-brand-ink px-4 py-2 text-center text-sm font-medium text-background">
        🚧 CartLedger is in its beta period — core functionality is currently
        free.
      </div>

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
            Automated tracking &amp; financials for food trucks
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight text-background sm:text-7xl">
            Track everything.
            <br />
            Automatically.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-background/85 sm:text-xl">
            CartLedger turns your Square sales into income, expenses, inventory,
            and profit — automatically — and keeps a running checklist of what
            needs you next, from low-stock reorders to expiring permits. Your
            money and your paperwork, tracked in one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free trial
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
            14-day free trial · Cancel anytime · Set up in minutes
          </p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1.5 px-5 py-6 text-center sm:px-6">
          <p className="text-sm font-medium text-muted-foreground">
            One place for everything a truck owner juggles
          </p>
          <p className="text-pretty text-base font-medium">
            Sales &amp; profit · Inventory &amp; reorders · Food cost · Expenses
            · QuickBooks export · Permits &amp; COIs · Inspections
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your whole operation, tracked and automated
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Stop juggling spreadsheets, glove-box folders, and calendar
              reminders. CartLedger tracks the money and the paperwork, and
              tells you what to do next.
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
            Know your numbers. Never miss a deadline.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-background/85">
            Connect Square and CartLedger tracks your sales, costs, profit, and
            paperwork automatically — then tells you what needs you next.
            14-day free trial.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free trial
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
