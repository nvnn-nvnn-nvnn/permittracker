import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Trucks · VendGuard" };
export const dynamic = "force-dynamic";

export default async function TrucksPage() {
  const api = await serverApi();
  const trucks = await api.truck.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Trucks</h1>
        <Link href="/trucks/new" className={buttonVariants({ size: "sm" })}>
          Add truck
        </Link>
      </div>

      {trucks.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No trucks yet</CardTitle>
            <CardDescription>
              Add your first truck to start tracking its permits.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {trucks.map((t) => (
            <Link key={t.id} href={`/trucks/${t.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {t.plateOrVin ?? "no plate"} ·{" "}
                      {t.jurisdiction ?? "no jurisdiction"}
                    </p>
                  </div>
                  <Badge variant={t.isActive ? "green" : "outline"}>
                    {t.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
