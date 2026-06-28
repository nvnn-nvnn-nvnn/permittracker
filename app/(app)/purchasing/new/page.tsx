import { PurchaseOrderForm } from "@/components/features/purchase-order-form";

export const metadata = { title: "New purchase order · CartLedger" };

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">New order</h1>
      <PurchaseOrderForm />
    </div>
  );
}
