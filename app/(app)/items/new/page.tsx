import { serverApi } from "@/lib/trpc/server";
import { itemTypeValues } from "@/lib/validators";
import { NewItemChooser } from "@/components/features/new-item-chooser";

export const metadata = { title: "Add item · VendGuard" };
export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; subtype?: string }>;
}) {
  const api = await serverApi();
  const [trucks, items, people, venues, sp] = await Promise.all([
    api.truck.list(),
    api.item.list(),
    api.person.list(),
    api.venue.list(),
    searchParams,
  ]);

  const initialType = (itemTypeValues as readonly string[]).includes(
    sp.type ?? "",
  )
    ? (sp.type as (typeof itemTypeValues)[number])
    : undefined;
  const initialSubtype = sp.subtype?.slice(0, 160);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Add compliance item
      </h1>
      <NewItemChooser
        trucks={trucks.map((t) => ({ id: t.id, name: t.name }))}
        parentOptions={items.map((i) => ({
          id: i.id,
          label: `${i.itemType} — ${i.subtype ?? i.identifier ?? "item"}`,
        }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
        initialType={initialType}
        initialSubtype={initialSubtype}
      />
    </div>
  );
}
