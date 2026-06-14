import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Pricing · VendGuard",
  description:
    "Simple per-business pricing for food truck compliance tracking. Start free, upgrade as your fleet grows.",
};

const TIERS = [
  {
    tier: "starter",
    label: "Starter",
    price: 19,
    yearly: 190,
    tagline: "For a single truck getting organized.",
    featured: false,
    features: [
      "1 active truck",
      "Up to 15 compliance items",
      "Email reminders before expiry",
      "AI document scanning",
      "Inspection-prep digests",
    ],
  },
  {
    tier: "pro",
    label: "Pro",
    price: 49,
    yearly: 490,
    tagline: "For growing operators with a few trucks.",
    featured: true,
    features: [
      "Up to 3 trucks",
      "Unlimited compliance items",
      "Email reminders",
      "SMS + voice escalation (Coming soon)",
      "Staff & commissary cascades",
      "Everything in Starter",
    ],
  },
  {
    tier: "fleet",
    label: "Fleet",
    price: 129,
    yearly: 1290,
    tagline: "For multi-truck fleets and teams.",
    featured: false,
    features: [
      "Up to 10 trucks",
      "Unlimited compliance items",
      "Team logins",
      "Commissary fleet view",
      "Priority support",
      "Everything in Pro",
    ],
  },
];

export default function PricingPage() {
  return (
    <main>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-6 sm:py-24">
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Pricing that scales with your fleet
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Per business, not per seat. Start free, upgrade when you add another
            truck. Two months free on annual plans.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <div className="grid items-start gap-6 lg:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.tier}
                className={cn(
                  "flex flex-col rounded-2xl border bg-card p-7",
                  t.featured
                    ? "border-primary shadow-[var(--shadow-soft)] ring-1 ring-primary/20"
                    : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">{t.label}</h2>
                  {t.featured && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.tagline}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    ${t.price}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  or ${t.yearly}/year
                </p>
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({
                      variant: t.featured ? "default" : "outline",
                    }),
                    "mt-6",
                  )}
                >
                  Start free
                </Link>
                <ul className="mt-7 flex flex-col gap-3 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            Prices are placeholders for this preview. Questions about a larger
            fleet?{" "}
            <Link href="/contact" className="font-medium text-primary hover:underline">
              Talk to us
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
