import { InventoryCountForm } from "@/components/features/inventory-count-form";

export const metadata = { title: "New inventory count · VendGuard" };

export default function NewInventoryCountPage() {
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
      <InventoryCountForm />
    </div>
  );
}
