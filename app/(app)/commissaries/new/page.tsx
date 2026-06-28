import { CommissaryForm } from "@/components/features/commissary-form";

export const metadata = { title: "Add commissary · CartLedger" };

export default function NewCommissaryPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Add commissary
      </h1>
      <CommissaryForm />
    </div>
  );
}
