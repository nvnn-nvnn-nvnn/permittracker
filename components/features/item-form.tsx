"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MN_JURISDICTIONS } from "@/lib/jurisdictions";
import { defaultRemindersFor, itemTypeValues } from "@/lib/validators";
import { dateInputValue } from "@/lib/format";
import type { ComplianceItem } from "@/lib/db/schema";

type TruckOption = { id: string; name: string };

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ItemForm({
  item,
  trucks,
}: {
  item?: ComplianceItem;
  trucks: TruckOption[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = Boolean(item);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(item?.itemType ?? "permit");

  const onDone = async () => {
    await utils.item.list.invalidate();
    router.push(item ? `/items/${item.id}` : "/items");
    router.refresh();
  };
  const create = trpc.item.create.useMutation({ onSuccess: onDone });
  const update = trpc.item.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  const reminderDefault = (
    item?.reminderDaysBefore?.length
      ? item.reminderDaysBefore
      : defaultRemindersFor(type as (typeof itemTypeValues)[number])
  ).join(", ");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const reminders = String(fd.get("reminderDaysBefore") ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
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
      notes: String(fd.get("notes") ?? ""),
      reminderDaysBefore: reminders,
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && item) update.mutate({ id: item.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="itemType">
          <select
            id="itemType"
            name="itemType"
            className={selectCls}
            defaultValue={item?.itemType ?? "permit"}
            onChange={(e) =>
              setType(
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
      </div>

      <Field label="Reminder days before expiry (comma-separated)" htmlFor="reminderDaysBefore">
        <Input
          id="reminderDaysBefore"
          name="reminderDaysBefore"
          key={reminderDefault}
          defaultValue={reminderDefault}
        />
      </Field>
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

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add item"}
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
