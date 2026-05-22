"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MN_JURISDICTIONS } from "@/lib/jurisdictions";
import { defaultRemindersFor, itemTypeValues } from "@/lib/validators";
import { dateInputValue } from "@/lib/format";
import type { ComplianceItem } from "@/lib/db/schema";

type TruckOption = { id: string; name: string };

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Standard reminder offsets offered as one-tap chips (days before expiry). */
const REMINDER_PRESETS = [90, 60, 30, 14, 7, 3, 1, 0];

function dayLabel(d: number): string {
  if (d === 0) return "Day of";
  return `${d} day${d === 1 ? "" : "s"} before`;
}

type ParentOption = { id: string; label: string };

export function ItemForm({
  item,
  trucks,
  parentOptions = [],
  people = [],
  venues = [],
}: {
  item?: ComplianceItem;
  trucks: TruckOption[];
  parentOptions?: ParentOption[];
  people?: TruckOption[];
  venues?: TruckOption[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(item);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(item?.itemType ?? "permit");

  // Reminder offsets are managed as state (chips + custom add), not raw text.
  const [reminderDays, setReminderDays] = useState<number[]>(() =>
    item?.reminderDaysBefore?.length
      ? [...item.reminderDaysBefore].sort((a, b) => b - a)
      : defaultRemindersFor(
          (item?.itemType ?? "permit") as (typeof itemTypeValues)[number],
        ),
  );
  const [remindersTouched, setRemindersTouched] = useState(false);
  const [customDay, setCustomDay] = useState("");
  // Soft, non-blocking confirmation (a "catch", not an error).
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const onDone = async () => {
    await utils.item.list.invalidate();
    router.push(item ? `/items/${item.id}` : "/items");
    router.refresh();
  };
  const create = trpc.item.create.useMutation({ onSuccess: onDone });
  const update = trpc.item.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  const sortDesc = (xs: number[]) => [...new Set(xs)].sort((a, b) => b - a);

  function toggleDay(d: number) {
    setRemindersTouched(true);
    setConfirmMsg(null);
    setReminderDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : sortDesc([...prev, d]),
    );
  }
  function addCustomDay() {
    const n = parseInt(customDay.trim(), 10);
    if (!Number.isFinite(n) || n < 0 || n > 365) return;
    setRemindersTouched(true);
    setConfirmMsg(null);
    setReminderDays((prev) => sortDesc([...prev, n]));
    setCustomDay("");
  }
  // When the type changes on a NEW item and the user hasn't customised
  // reminders yet, refresh to that type's sensible defaults.
  function onTypeChange(next: (typeof itemTypeValues)[number]) {
    setType(next);
    if (!isEdit && !remindersTouched) {
      setReminderDays(defaultRemindersFor(next));
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // --- Soft "catch": warn (don't error) on empty / unfilled additions ---
    let warning: string | null = null;
    if (customDay.trim() !== "") {
      warning = `You typed a custom reminder ("${customDay.trim()}") but didn't add it with “Add”. It won't be saved.`;
    } else if (reminderDays.length === 0) {
      warning =
        "No reminders set — VendGuard won't warn you before this expires.";
    }
    if (warning) {
      if (confirmMsg !== warning) {
        // First attempt: show the catch, do NOT submit. No error thrown.
        setConfirmMsg(warning);
        return;
      }
      // Second attempt with the same warning shown = user confirmed.
    }
    setConfirmMsg(null);

    const fd = new FormData(e.currentTarget);
    const reminders = reminderDays;
    const data = {
      itemType: String(fd.get("itemType")) as (typeof itemTypeValues)[number],
      subtype: String(fd.get("subtype") ?? ""),
      jurisdiction: String(fd.get("jurisdiction") ?? ""),
      identifier: String(fd.get("identifier") ?? ""),
      issueDate: String(fd.get("issueDate") ?? ""),
      expirationDate: String(fd.get("expirationDate") ?? ""),
      feeAmount: String(fd.get("feeAmount") ?? ""),
      feeDueDate: String(fd.get("feeDueDate") ?? ""),
      status: String(fd.get("status") ?? "active") as
        | "active"
        | "pending"
        | "expired",
      holderType: String(fd.get("holderType") ?? "truck") as
        | "truck"
        | "person"
        | "business",
      holderTruckId: String(fd.get("holderTruckId") ?? ""),
      holderName: String(fd.get("holderName") ?? ""),
      parentItemId: String(fd.get("parentItemId") ?? ""),
      personId: String(fd.get("personId") ?? ""),
      venueId: String(fd.get("venueId") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      reminderDaysBefore: reminders,
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && item) update.mutate({ id: item.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" htmlFor="itemType">
          <select
            id="itemType"
            name="itemType"
            className={selectCls}
            value={type}
            onChange={(e) =>
              onTypeChange(
                e.target.value as (typeof itemTypeValues)[number],
              )
            }
          >
            {itemTypeValues.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subtype" htmlFor="subtype">
          <Input
            id="subtype"
            name="subtype"
            defaultValue={item?.subtype ?? ""}
            placeholder="Mobile food unit license"
          />
        </Field>
        <Field label="Jurisdiction" htmlFor="jurisdiction">
          <Input
            id="jurisdiction"
            name="jurisdiction"
            list="jurisdictions"
            defaultValue={item?.jurisdiction ?? ""}
          />
          <datalist id="jurisdictions">
            {MN_JURISDICTIONS.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        </Field>
        <Field label="Identifier / number" htmlFor="identifier">
          <Input
            id="identifier"
            name="identifier"
            defaultValue={item?.identifier ?? ""}
          />
        </Field>
        <Field label="Issue date" htmlFor="issueDate">
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={dateInputValue(item?.issueDate)}
          />
        </Field>
        <Field label="Expiration date" htmlFor="expirationDate">
          <Input
            id="expirationDate"
            name="expirationDate"
            type="date"
            defaultValue={dateInputValue(item?.expirationDate)}
          />
        </Field>
        <Field label="Renewal fee (USD)" htmlFor="feeAmount">
          <Input
            id="feeAmount"
            name="feeAmount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              item?.feeAmountCents != null
                ? (item.feeAmountCents / 100).toString()
                : ""
            }
          />
        </Field>
        <Field label="Fee due date" htmlFor="feeDueDate">
          <Input
            id="feeDueDate"
            name="feeDueDate"
            type="date"
            defaultValue={dateInputValue(item?.feeDueDate)}
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            className={selectCls}
            defaultValue={item?.status ?? "active"}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
        </Field>
        <Field label="Attached to" htmlFor="holderType">
          <select
            id="holderType"
            name="holderType"
            className={selectCls}
            defaultValue={item?.holderType ?? "truck"}
          >
            <option value="truck">Truck</option>
            <option value="person">Person</option>
            <option value="business">Business</option>
          </select>
        </Field>
        <Field label="Truck" htmlFor="holderTruckId">
          <select
            id="holderTruckId"
            name="holderTruckId"
            className={selectCls}
            defaultValue={item?.holderTruckId ?? ""}
          >
            <option value="">— none —</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Holder name (person/business)" htmlFor="holderName">
          <Input
            id="holderName"
            name="holderName"
            defaultValue={item?.holderName ?? ""}
          />
        </Field>
        <Field label="Depends on (parent item)" htmlFor="parentItemId">
          <select
            id="parentItemId"
            name="parentItemId"
            className={selectCls}
            defaultValue={item?.parentItemId ?? ""}
          >
            <option value="">— none —</option>
            {parentOptions
              .filter((p) => p.id !== item?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Person (cert holder)" htmlFor="personId">
          <select
            id="personId"
            name="personId"
            className={selectCls}
            defaultValue={item?.personId ?? ""}
          >
            <option value="">— none —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venue (for COIs)" htmlFor="venueId">
          <select
            id="venueId"
            name="venueId"
            className={selectCls}
            defaultValue={item?.venueId ?? ""}
          >
            <option value="">— none —</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Reminder schedule</Label>
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          🔔 These are the advance notices VendGuard sends (email/SMS) to
          warn you about upcoming permit expiry — and other deadlines like a
          fee due — so nothing lapses while you&apos;re between services. Pick
          the standard offsets or add a custom one.
        </p>
        <div className="flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((d) => {
            const on = reminderDays.includes(d);
            return (
              <button
                type="button"
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {dayLabel(d)}
              </button>
            );
          })}
          {reminderDays
            .filter((d) => !REMINDER_PRESETS.includes(d))
            .map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => toggleDay(d)}
                className="rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                title="Remove custom reminder"
              >
                {dayLabel(d)} ✕
              </button>
            ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            max="365"
            inputMode="numeric"
            placeholder="Custom days"
            value={customDay}
            onChange={(e) => setCustomDay(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomDay();
              }
            }}
            className="h-9 w-36"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustomDay}
          >
            Add
          </Button>
          <span className="text-xs text-muted-foreground">
            {reminderDays.length} reminder
            {reminderDays.length === 1 ? "" : "s"} set
          </span>
        </div>
      </div>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={item?.notes ?? ""} />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {confirmMsg && (
        <p
          role="status"
          className="rounded-md bg-status-yellow/15 px-3 py-2 text-sm text-status-yellow"
        >
          ⚠ {confirmMsg} Adjust it above, or click{" "}
          <strong>“{isEdit ? "Save anyway" : "Add anyway"}”</strong> to
          continue.
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : confirmMsg
              ? isEdit
                ? "Save anyway"
                : "Add anyway"
              : isEdit
                ? "Save changes"
                : "Add item"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/items")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
