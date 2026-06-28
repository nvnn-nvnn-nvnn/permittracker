import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import { serverApi } from "@/lib/trpc/server";
import { computeAccountStatus } from "@/lib/status";
import { buttonVariants } from "@/components/ui/button";
import { TruckRollup } from "@/components/features/truck-rollup";

export const metadata = { title: "Trucks · CartLedger" };
export const dynamic = "force-dynamic";

export default async function TrucksPage() {
  const [ctx, api] = await Promise.all([
    requireAccountContext(),
    serverApi(),
  ]);
  const [trucks, status] = await Promise.all([
    api.truck.list(),
    computeAccountStatus(ctx.accountId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Trucks</h1>
        <Link href="/trucks/new" className={buttonVariants({ size: "sm" })}>
          Add truck
        </Link>
      </div>

      <TruckRollup trucks={trucks} items={status.items} />
    </div>
  );
}
