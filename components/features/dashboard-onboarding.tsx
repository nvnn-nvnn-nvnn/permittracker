import Link from "next/link";
import { Truck, ClipboardList, BellRing, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Truck,
    title: "Create your first truck",
    body: "Your truck is home base. Every permit, inspection, cert, COI, and commissary fee attaches to it — so it comes first.",
  },
  {
    icon: ClipboardList,
    title: "Add what keeps it legal",
    body: "Log the permits, inspections, certifications, insurance (COIs), and commissary agreements for that truck, each with its expiration or fee-due date.",
  },
  {
    icon: BellRing,
    title: "Let CartLedger watch the dates",
    body: "We track every deadline and remind you by email — plus SMS and voice on eligible plans — before anything can shut you down.",
  },
];

/**
 * Empty-state walkthrough shown on the dashboard when an account has no trucks
 * and no items yet. Guides a brand-new user through the truck-first model:
 * create a truck (the parent), then attach compliance items to it. Step 1 is
 * the only live action because items can't exist without a truck.
 */
export function DashboardOnboarding({ name }: { name?: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <div className="space-y-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Truck className="size-3.5 text-brand-ink" />
          Let&apos;s get you set up
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to CartLedger{name ? `, ${name}` : ""}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Three quick steps and you&apos;ll never get blindsided by an expired
          permit again. Start by adding the truck you want to keep open.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => {
          const isFirst = i === 0;
          return (
            <li
              key={title}
              className={cn(
                "flex gap-4 rounded-2xl border bg-card p-5 transition-colors",
                isFirst
                  ? "border-brand-ink/30 ring-1 ring-brand-ink/20"
                  : "border-border",
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    isFirst
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="w-px flex-1 bg-border" aria-hidden="true" />
                )}
              </div>

              <div className="flex-1 space-y-1.5 pb-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "size-4",
                      isFirst ? "text-brand-ink" : "text-muted-foreground",
                    )}
                  />
                  <h2 className="font-semibold">{title}</h2>
                </div>
                <p className="text-sm text-muted-foreground">{body}</p>
                {isFirst && (
                  <Link
                    href="/trucks/new"
                    className={cn(buttonVariants(), "mt-3 w-full sm:w-auto")}
                  >
                    Create your first truck
                    <ArrowRight className="size-4" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-center text-xs text-muted-foreground">
        Already have things to track?{" "}
        <Link href="/trucks/new" className="text-brand-ink hover:underline">
          Add a truck
        </Link>{" "}
        to get started.
      </p>
    </div>
  );
}
