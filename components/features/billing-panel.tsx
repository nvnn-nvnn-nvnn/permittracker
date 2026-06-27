"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Display catalog — mirrors lib/stripe/index.ts PLANS (server-only there).
// NOTE: SMS + voice channels are deferred at launch (Twilio A2P 10DLC
// pending — see notes/00-decisions.md → Known caveats). Pricing copy
// marks them "Coming soon"; revert once Twilio is live.
const TIERS = [
  { tier: "starter", label: "Starter", month: 19, year: 190, blurb: "1 truck · 15 items · email reminders" },
  { tier: "pro", label: "Pro", month: 49, year: 490, blurb: "3 trucks · unlimited items · email reminders · SMS + voice (Coming soon)" },
  { tier: "fleet", label: "Fleet", month: 129, year: 1290, blurb: "10 trucks · team logins · commissary view · SMS + voice (Coming soon)" },
] as const;

type Interval = "month" | "year";

export function BillingPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const utils = trpc.useUtils();
  const status = trpc.billing.status.useQuery();
  const checkout = trpc.billing.createCheckout.useMutation();
  // Concierge onboarding deferred at launch — see the commented button
  // below + notes/00-decisions.md. Restore by uncommenting both.
  // const concierge = trpc.billing.createConciergeCheckout.useMutation();
  const portal = trpc.billing.createPortal.useMutation();
  const sync = trpc.billing.syncFromStripe.useMutation();

  const [interval, setInterval] = useState<Interval>("month");
  const [msg, setMsg] = useState<string | null>(null);

  // Returning from Checkout: reconcile immediately (don't wait for webhook).
  const billingParam = params.get("billing");
  useEffect(() => {
    if (!billingParam) return;
    if (billingParam === "success" || billingParam === "concierge") {
      sync.mutateAsync().finally(async () => {
        await utils.billing.status.invalidate();
        router.replace("/settings");
      });
    } else if (billingParam === "cancel") {
      setMsg("Checkout canceled — no changes made.");
      router.replace("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingParam]);

  if (status.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading billing…
        </CardContent>
      </Card>
    );
  }
  const s = status.data;
  if (!s) return null;

  const trialDaysLeft =
    s.status === "trialing" && s.currentPeriodEnd
      ? Math.max(
          0,
          Math.ceil(
            (new Date(s.currentPeriodEnd).getTime() - Date.now()) /
              86_400_000,
          ),
        )
      : null;

  const go = (url: string) => {
    window.location.href = url;
  };
  const err = (e: unknown) =>
    setMsg(e instanceof Error ? e.message : "Something went wrong");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Billing
          <Badge variant={s.status === "active" || s.status === "trialing" ? "green" : "outline"}>
            {s.tier} · {s.status === "trialing" ? "free trial" : s.status}
          </Badge>
        </CardTitle>
        <CardDescription>
          {s.status === "trialing"
            ? `Free trial of ${s.tier} — ${
                trialDaysLeft !== null
                  ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                  : "active"
              }${
                s.currentPeriodEnd
                  ? ` (billing starts ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US")})`
                  : ""
              }.`
            : s.status === "active"
              ? `Your ${s.tier} plan is active${
                  s.currentPeriodEnd
                    ? ` until ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US")}`
                    : ""
                }.`
              : "No active subscription — limits are at the Starter floor."}
          {s.conciergePurchasedAt && " · Concierge onboarding purchased."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!s.stripeConfigured && (
          <p className="rounded-md bg-status-yellow/15 px-3 py-2 text-xs text-status-yellow">
            ⚠ Billing isn&apos;t configured yet (no Stripe key). Limits still
            apply at the Starter floor; checkout is disabled.
          </p>
        )}
        {!s.isOwner && (
          <p className="text-xs text-muted-foreground">
            Only the account owner can change billing.
          </p>
        )}
        {msg && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs">{msg}</p>
        )}

        {s.trialEligible && s.stripeConfigured && (
          <p className="rounded-md bg-status-green/10 px-3 py-2 text-xs text-foreground">
            🎉 Start with a <strong>{s.trialDays}-day free trial</strong> on any
            plan. Card required — cancel anytime before it ends and you won&apos;t
            be charged.
          </p>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Billing period:</span>
          {(["month", "year"] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`rounded-full border px-3 py-1 text-xs ${
                interval === iv
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground"
              }`}
            >
              {iv === "month" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => {
            const current =
              s.tier === t.tier &&
              (s.status === "active" || s.status === "trialing");
            return (
              <div
                key={t.tier}
                className="flex flex-col gap-2 rounded-lg border p-4"
              >
                <p className="font-semibold">{t.label}</p>
                <p className="text-lg font-semibold">
                  ${interval === "month" ? t.month : t.year}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{interval}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t.blurb}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={current ? "outline" : "default"}
                  disabled={
                    !s.isOwner ||
                    !s.stripeConfigured ||
                    current ||
                    checkout.isPending
                  }
                  onClick={async () => {
                    setMsg(null);
                    try {
                      const r = await checkout.mutateAsync({
                        tier: t.tier,
                        interval,
                      });
                      go(r.url);
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  {current
                    ? "Current plan"
                    : s.trialEligible
                      ? `Start ${s.trialDays}-day trial`
                      : `Choose ${t.label}`}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!s.isOwner || !s.stripeConfigured || portal.isPending}
            onClick={async () => {
              setMsg(null);
              try {
                const r = await portal.mutateAsync();
                go(r.url);
              } catch (e) {
                err(e);
              }
            }}
          >
            Manage billing
          </Button>
          {/*
           * Concierge onboarding ($49 one-time) — DEFERRED at launch.
           * Feature is intentionally hidden from the UI; the webhook +
           * admin queue + schema columns remain so historical data is
           * preserved and re-enabling is just uncommenting this block.
           * See notes/00-decisions.md → Known caveats.
           *
           * {!s.conciergePurchasedAt && (
           *   <Button
           *     type="button"
           *     size="sm"
           *     variant="outline"
           *     disabled={
           *       !s.isOwner || !s.stripeConfigured || concierge.isPending
           *     }
           *     onClick={async () => {
           *       setMsg(null);
           *       try {
           *         const r = await concierge.mutateAsync();
           *         go(r.url);
           *       } catch (e) {
           *         err(e);
           *       }
           *     }}
           *   >
           *     Add concierge onboarding ($49)
           *   </Button>
           * )}
           */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!s.isOwner || !s.stripeConfigured || sync.isPending}
            onClick={async () => {
              setMsg(null);
              try {
                await sync.mutateAsync();
                await utils.billing.status.invalidate();
                setMsg("Synced with Stripe.");
              } catch (e) {
                err(e);
              }
            }}
          >
            {sync.isPending ? "Syncing…" : "Sync from Stripe"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
