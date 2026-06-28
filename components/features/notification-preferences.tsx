"use client";
import { useEffect, useState } from "react";
import { Mail, MessageSquare, Lock, Check, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Notification-channel preferences. Email is on by default; SMS is locked
 * behind the paywall + beta gate for now. If the user tries to disable email
 * (leaving zero active channels) we warn them with a modal first. The email
 * toggle persists to the account (account.setEmailNotifications) and gates
 * reminder email dispatch server-side.
 */
export function NotificationPreferences({ email }: { email: string }) {
  const utils = trpc.useUtils();
  const settings = trpc.account.notificationSettings.useQuery();
  const setEmail = trpc.account.setEmailNotifications.useMutation({
    onSettled: () => utils.account.notificationSettings.invalidate(),
  });

  const emailOn = settings.data?.notifyEmail ?? true;
  const smsOn = false; // locked: beta + Pro paywall
  const [warnOpen, setWarnOpen] = useState(false);

  const allOff = !emailOn && !smsOn;

  function persist(enabled: boolean) {
    // Optimistic: flip the cached value immediately, then mutate.
    utils.account.notificationSettings.setData(undefined, (prev) =>
      prev ? { ...prev, notifyEmail: enabled } : prev,
    );
    setEmail.mutate({ enabled });
  }

  function toggleEmail(next: boolean) {
    // Turning email off while SMS is locked off ⇒ no channels left. Warn first.
    if (!next && !smsOn) {
      setWarnOpen(true);
      return;
    }
    persist(next);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            Choose how CartLedger reaches you before a permit, inspection, cert,
            or COI expires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {allOff ? (
            <p className="flex items-start gap-2 rounded-lg border border-status-red/40 bg-status-red/5 px-3 py-2 text-status-red">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                All reminders are off. CartLedger won&apos;t warn you before
                anything expires — you&apos;ll have to track every date
                yourself.
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              You&apos;re currently set to receive reminders by{" "}
              <strong className="text-foreground">email</strong>
              {emailOn && smsOn ? " and SMS" : ""}.
            </p>
          )}

          <ChannelRow
            icon={Mail}
            title="Email"
            desc={`Sent to ${email}`}
            checked={emailOn}
            onChange={toggleEmail}
          />

          <ChannelRow
            icon={MessageSquare}
            title="SMS text"
            desc="Text reminders straight to your phone."
            checked={false}
            locked
            lockLabel="Beta · Pro"
            note="SMS reminders are in private beta and will unlock on Pro plans. Not available to enable yet."
          />
        </CardContent>
      </Card>

      {warnOpen && (
        <TurnOffWarningModal
          onCancel={() => setWarnOpen(false)}
          onConfirm={() => {
            persist(false);
            setWarnOpen(false);
          }}
        />
      )}
    </>
  );
}

function ChannelRow({
  icon: Icon,
  title,
  desc,
  checked,
  onChange,
  locked = false,
  lockLabel,
  note,
}: {
  icon: typeof Mail;
  title: string;
  desc: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  locked?: boolean;
  lockLabel?: string;
  note?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 transition-colors",
        checked ? "border-brand-ink/30 bg-card" : "border-border bg-card",
      )}
    >
      <CheckBox checked={checked} disabled={locked} onChange={onChange} />
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          checked ? "text-brand-ink" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {locked && lockLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              {lockLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{desc}</p>
        {note && <p className="text-xs text-muted-foreground/80">{note}</p>}
      </div>
    </div>
  );
}

function CheckBox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {checked ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : disabled ? (
        <Lock className="size-3 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function TurnOffWarningModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notif-warn-title"
        aria-describedby="notif-warn-desc"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-status-red/10 text-status-red">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 id="notif-warn-title" className="text-lg font-semibold">
              Turn off all reminders?
            </h2>
            <p id="notif-warn-desc" className="text-sm text-muted-foreground">
              With email and SMS both off, CartLedger can&apos;t warn you before
              a permit, inspection, cert, or COI expires — and a lapse can force
              you to stop operating. You&apos;ll have to track every date
              yourself.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onConfirm}>
            Turn off anyway
          </Button>
          <Button onClick={onCancel}>Keep reminders on</Button>
        </div>
      </div>
    </div>
  );
}
