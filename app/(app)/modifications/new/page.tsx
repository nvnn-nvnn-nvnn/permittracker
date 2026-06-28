import { ModificationForm } from "@/components/features/modification-form";

export const metadata = { title: "Log a change · CartLedger" };

export default async function NewModificationPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Log a change</h1>
      <ModificationForm defaultTruckId={truck} />
    </div>
  );
}
