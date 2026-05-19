import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { requireAccountContext } from "@/lib/auth/session";
import { listAuditForEntity } from "@/lib/audit";
import { ItemForm } from "@/components/features/item-form";
import { ArchiveButton } from "@/components/features/archive-button";
import { DocumentsPanel } from "@/components/features/documents-panel";
import { RemindersPanel } from "@/components/features/reminders-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { classifyItem } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAccountContext();
  const api = await serverApi();

  let item;
  try {
    item = await api.item.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const [trucks, items, people, venues, history] = await Promise.all([
    api.truck.list(),
    api.item.list(),
    api.person.list(),
    api.venue.list(),
    listAuditForEntity(ctx.accountId, "compliance_item", item.id),
  ]);
  const badge = classifyItem(item);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            <span className="uppercase text-muted-foreground">
              {item.itemType}
            </span>{" "}
            {item.subtype ?? item.identifier ?? "item"}
          </h1>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        {!item.archivedAt && (
          <ArchiveButton kind="item" id={item.id} redirectTo="/items" />
        )}
      </div>

      <ItemForm
        item={item}
        trucks={trucks.map((t) => ({ id: t.id, name: t.name }))}
        parentOptions={items.map((i) => ({
          id: i.id,
          label: `${i.itemType} — ${i.subtype ?? i.identifier ?? "item"}`,
        }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
      />

      <DocumentsPanel complianceItemId={item.id} />

      <RemindersPanel complianceItemId={item.id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Audit trail ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.length === 0 ? (
            <p className="text-muted-foreground">No history yet.</p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex justify-between gap-4 border-b py-1 last:border-0"
              >
                <span className="font-medium uppercase">{h.action}</span>
                <span className="text-muted-foreground">
                  {h.createdAt.toLocaleString("en-US")}
                </span>
              </div>
            ))
          )}
          <p className="pt-2 text-xs text-muted-foreground">
            Written by a Postgres trigger. This log is append-only — the app
            cannot edit or delete these rows.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
