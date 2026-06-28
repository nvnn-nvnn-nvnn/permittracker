import { serverApi } from "@/lib/trpc/server";
import { TruckForm } from "@/components/features/truck-form";

export const metadata = { title: "Add truck · CartLedger" };
export const dynamic = "force-dynamic";

export default async function NewTruckPage() {
  const api = await serverApi();
  const commissaries = await api.commissary.list();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add truck</h1>
      <TruckForm
        commissaries={commissaries.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
