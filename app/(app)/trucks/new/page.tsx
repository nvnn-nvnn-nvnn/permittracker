import { TruckForm } from "@/components/features/truck-form";

export const metadata = { title: "Add truck · PermitKeep" };

export default function NewTruckPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add truck</h1>
      <TruckForm />
    </div>
  );
}
