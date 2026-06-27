import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { ExpenseForm } from "@/components/features/expense-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let expense;
  try {
    expense = await api.expenses.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {expense.description}
          {expense.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!expense.archivedAt && (
          <ArchiveButton kind="expense" id={expense.id} redirectTo="/expenses" />
        )}
      </div>
      <ExpenseForm expense={expense} />
    </div>
  );
}
