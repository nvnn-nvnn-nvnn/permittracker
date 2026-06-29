import Link from "next/link";
import { requireAccountContext } from "@/lib/auth/session";
import { accountHasOperations } from "@/lib/limits";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SquareLocationPicker } from "@/components/features/square-location-picker";

export const metadata = { title: "Square locations · CartLedger" };
export const dynamic = "force-dynamic";

export default async function SquareLocationsPage() {
  const ctx = await requireAccountContext();
  if (!(await accountHasOperations(ctx.accountId))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Square</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            The Operations tools are on the Pro plan.{" "}
            <Link href="/settings" className="text-brand-ink hover:underline">
              Upgrade in Billing
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const api = await serverApi();
  const [conn, locations, mapping] = await Promise.all([
    api.ops.connection(),
    api.ops.squareLocations(),
    api.ops.truckLocations(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Square locations
        </h1>
        <p className="text-sm text-muted-foreground">
          Map each Square location to a truck. Sales from a location are
          attributed to its truck&apos;s P&amp;L and inventory.
        </p>
      </div>

      {!conn.oauthConnected && !conn.isSquareConfigured ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Connect your Square account first, then come back to map
              locations.
            </p>
            {conn.oauthConfigured ? (
              <a
                href="/api/square/connect"
                className={buttonVariants({ size: "sm" })}
              >
                Connect Square
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Square isn&apos;t configured on this environment yet.
              </p>
            )}
          </CardContent>
        </Card>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No Square locations found on the connected account.
          </CardContent>
        </Card>
      ) : (
        <SquareLocationPicker
          trucks={mapping.map((m) => ({
            truckId: m.truckId,
            truckName: m.truckName,
            locationId: m.locationId,
          }))}
          locations={locations}
        />
      )}

      <p className="text-xs text-muted-foreground">
        After mapping, head back to{" "}
        <Link href="/operations" className="text-brand-ink hover:underline">
          Operations
        </Link>{" "}
        and hit Sync to pull each location&apos;s sales.
      </p>
    </div>
  );
}
