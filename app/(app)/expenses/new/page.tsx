import { ExpenseForm } from "@/components/features/expense-form";

export const metadata = { title: "Add expense · CartLedger" };

export default function NewExpensePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add expense</h1>
      <ExpenseForm />
    </div>
  );
}
