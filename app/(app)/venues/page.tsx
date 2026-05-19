import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Venues · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const api = await serverApi();
  const venues = await api.venue.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Venues</h1>
        <Link href="/venues/new" className={buttonVariants({ size: "sm" })}>
          Add venue
        </Link>
      </div>

      {venues.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No venues yet</CardTitle>
            <CardDescription>
              Track events/locations that require a COI with specific
              additional-insured language.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {venues.map((v) => (
            <Link key={v.id} href={`/venues/${v.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="p-4">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {v.address ?? "no address"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
