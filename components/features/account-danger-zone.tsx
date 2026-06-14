"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AccountRow = { id: string; name: string; slug: string };

/**
 * Platform-admin tool to fulfill GDPR/CCPA erasure requests. Irreversibly
 * deletes an account, its owner login, documents, and Stripe subscription via
 * admin.deleteAccountPermanently. Echo-confirm: the operator must type the
 * account's exact slug (also enforced server-side) before the button enables.
 */
export function AccountDangerZone({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const del = trpc.admin.deleteAccountPermanently.useMutation();

  const selected = accounts.find((a) => a.id === selectedId);
  const slugMatches = !!selected && confirmSlug === selected.slug;

  const reset = () => {
    setSelectedId("");
    setConfirmSlug("");
    setReason("");
    setError(null);
  };

  const onDelete = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Permanently delete "${selected.name}"? This erases the account, its ` +
          `login, all documents, and billing. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await del.mutateAsync({
        accountId: selected.id,
        confirmSlug,
        reason: reason.trim() || undefined,
      });
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">
          Danger zone · delete account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Irreversibly erases an account, its owner login, all uploaded
          documents, and the Stripe subscription, and records a proof-of-erasure
          entry. Use only to fulfill a verified GDPR/CCPA deletion request.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="dz-account">Account</Label>
          <select
            id="dz-account"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setConfirmSlug("");
              setError(null);
            }}
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          >
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.slug})
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="dz-slug">
                Type the slug{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                  {selected.slug}
                </code>{" "}
                to confirm
              </Label>
              <Input
                id="dz-slug"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={selected.slug}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dz-reason">Reason (optional)</Label>
              <Input
                id="dz-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. user deletion request — ticket #123"
              />
            </div>

            {error && (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              variant="destructive"
              disabled={!slugMatches || del.isPending}
              onClick={onDelete}
            >
              {del.isPending ? "Deleting…" : "Permanently delete account"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
