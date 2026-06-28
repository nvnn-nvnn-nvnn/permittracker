import { InventoryCountForm } from "@/components/features/inventory-count-form";

export const metadata = { title: "New inventory count · CartLedger" };

export default async function NewInventoryCountPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Take a count
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter what you actually have on hand. We&apos;ll snapshot the value and
          reconcile your inventory.
        </p>
      </div>
      <InventoryCountForm defaultTruckId={truck} />
    </div>
  );
}
