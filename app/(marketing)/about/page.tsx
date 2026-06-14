import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "About · VendGuard",
  description:
    "Why VendGuard exists: keeping mobile food operators open by making compliance impossible to forget.",
};

const VALUES = [
  {
    title: "Operators first",
    body: "Every decision is judged by one question: does this help a truck stay open and compliant with less effort?",
  },
  {
    title: "Never lose a record",
    body: "Compliance data is sacred. We archive instead of delete, and keep an append-only history you can stand behind.",
  },
  {
    title: "Honest about limits",
    body: "We track and remind — we don't file or guarantee. We tell you clearly what's a suggestion and what's confirmed.",
  },
  {
    title: "Quietly reliable",
    body: "The best compliance tool is one you forget about, because it reminds you exactly when it matters.",
  },
];

export default function AboutPage() {
  return (
    <main>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-6 sm:py-24">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            About
          </span>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Compliance shouldn&apos;t be the reason you close.
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">
            A single lapsed permit or expired COI can shut a food truck down for
            a weekend — or a season. The information isn&apos;t hard to track;
            it&apos;s just scattered across glove boxes, inboxes, and agency
            portals, each with its own renewal date. VendGuard pulls it into one
            place and makes sure a deadline never sneaks up on you again.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight">Why we built it</h2>
          <div className="mt-5 space-y-4 text-pretty text-muted-foreground">
            <p>
              Mobile food is one of the most heavily regulated small businesses
              there is — health permits, fire and hood inspections,
              food-handler cards, vehicle registration, insurance certificates,
              and a commissary agreement on top. Each renews on its own clock,
              and the penalty for missing one is steep.
            </p>
            <p>
              Big-business compliance software is overkill and overpriced for a
              one-to-ten-truck operation. So operators end up with spreadsheets
              and calendar reminders that quietly fall out of date. VendGuard is
              purpose-built for that gap: simple enough to set up in an
              afternoon, thorough enough that nothing slips through.
            </p>
            <p className="text-sm italic">
              This is placeholder copy for the marketing preview — the real
              story and team details go here before launch.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-secondary/30">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight">What we value</h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.title}>
                <h3 className="text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-pretty text-muted-foreground">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-6">
          <h2 className="text-balance text-3xl font-bold tracking-tight">
            Want the same peace of mind?
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free
            </Link>
            <Link
              href="/contact"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
