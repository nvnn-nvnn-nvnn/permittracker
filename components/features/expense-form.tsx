"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { expenseCategories } from "@/lib/validators";
import { dateInputValue } from "@/lib/format";
import type { Expense } from "@/lib/db/schema";

export function ExpenseForm({ expense }: { expense?: Expense }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const trucks = trpc.truck.list.useQuery();
  const isEdit = Boolean(expense);
  const [error, setError] = useState<string | null>(null);

  const onDone = async () => {
    await utils.expenses.list.invalidate();
    router.push("/expenses");
    router.refresh();
  };
  const create = trpc.expenses.create.useMutation({ onSuccess: onDone });
  const update = trpc.expenses.update.useMutation({ onSuccess: onDone });
  const pending = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      truckId: String(fd.get("truckId") ?? ""),
      description: String(fd.get("description") ?? ""),
      category: String(fd.get("category") ?? ""),
      amount: String(fd.get("amount") ?? "0") || "0",
      spentOn: String(fd.get("spentOn") ?? ""),
      vendorName: String(fd.get("vendorName") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Something went wrong");
    if (isEdit && expense)
      update.mutate({ id: expense.id, data }, { onError });
    else create.mutate(data, { onError });
  }

  const amountDollars =
    expense && expense.amountCents
      ? (expense.amountCents / 100).toString()
      : "";

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <Field label="Description" htmlFor="description">
        <Input
          id="description"
          name="description"
          required
          defaultValue={expense?.description ?? ""}
          placeholder="June truck insurance"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount ($)" htmlFor="amount">
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={amountDollars}
            placeholder="240.00"
          />
        </Field>
        <Field label="Date" htmlFor="spentOn">
          <Input
            id="spentOn"
            name="spentOn"
            type="date"
            required
            defaultValue={dateInputValue(expense?.spentOn ?? new Date())}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" htmlFor="category">
          <Input
            id="category"
            name="category"
            list="expense-categories"
            defaultValue={expense?.category ?? ""}
            placeholder="Insurance"
          />
          <datalist id="expense-categories">
            {expenseCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Vendor / payee" htmlFor="vendorName">
          <Input
            id="vendorName"
            name="vendorName"
            defaultValue={expense?.vendorName ?? ""}
            placeholder="State Farm"
          />
        </Field>
      </div>

      <Field label="Truck" htmlFor="truckId">
        <select
          id="truckId"
          name="truckId"
          defaultValue={expense?.truckId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Business-wide (all trucks)</option>
          {(trucks.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={expense?.notes ?? ""} />
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/expenses")}
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
