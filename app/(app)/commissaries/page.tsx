import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { classifyItem } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Commissaries · VendGuard" };
export const dynamic = "force-dynamic";

export default async function CommissariesPage() {
  const api = await serverApi();
  const commissaries = await api.commissary.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Commissaries
        </h1>
        <Link
          href="/commissaries/new"
          className={buttonVariants({ size: "sm" })}
        >
          Add commissary
        </Link>
      </div>

      {commissaries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No commissaries yet</CardTitle>
            <CardDescription>
              Add the licensed kitchen your trucks operate out of — its
              permit/contract expiry cascades onto dependent trucks.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {commissaries.map((c) => {
            const permit = classifyItem({
              expirationDate: c.permitExpiration,
              archivedAt: c.archivedAt,
            });
            return (
              <Link key={c.id} href={`/commissaries/${c.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        permit {fmtDate(c.permitExpiration)} · contract{" "}
                        {fmtDate(c.contractExpiration)}
                      </p>
                    </div>
                    <Badge variant={permit.variant}>{permit.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
