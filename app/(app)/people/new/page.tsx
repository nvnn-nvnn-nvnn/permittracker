import { serverApi } from "@/lib/trpc/server";
import { PersonForm } from "@/components/features/person-form";

export const metadata = { title: "Add person · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  const api = await serverApi();
  const trucks = await api.truck.list();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add person</h1>
      <PersonForm trucks={trucks.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
