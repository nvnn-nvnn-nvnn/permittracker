import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { REINSPECTION_META } from "@/lib/modifications";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Truck change log · CartLedger" };
export const dynamic = "force-dynamic";

export default async function ModificationsPage() {
  const api = await serverApi();
  const mods = await api.modification.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Truck change log
          </h1>
          <p className="text-sm text-muted-foreground">
            A dated record of equipment, layout, and menu changes — proof for
            the health department, and a heads-up when a change needs
            re-inspection.
          </p>
        </div>
        <Link
          href="/modifications/new"
          className={buttonVariants({ size: "sm" })}
        >
          Log a change
        </Link>
      </div>

      {mods.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No changes logged yet</CardTitle>
            <CardDescription>
              Log truck modifications (a new fryer, a layout change, a new menu
              item) so you have a paper trail and know what may trigger a
              re-inspection.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {mods.map((m) => {
              const meta = REINSPECTION_META[m.reinspectionStatus];
              return (
                <Link
                  key={m.id}
                  href={`/modifications/${m.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {m.description}
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.truckName} · {fmtDate(m.changedOn)}
                      {m.category ? ` · ${m.category}` : ""}
                      {m.reportedToHealthDept ? " · reported" : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
