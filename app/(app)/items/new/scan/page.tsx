import { serverApi } from "@/lib/trpc/server";
// import { ItemForm } from "@/components/features/item-form";
// import { itemTypeValues } from "@/lib/validators";


import { ScanToCreate } from "@/components/features/scan-to-create";

export const metadata = {title: "Scan a document"}
export const dynamic = "force-dynamic";



// type TruckOption = {id: string; name: string};
// type ParentOption = {id: string; label: string};




export default async function NewItemScanPage() {

    // Api imports

    const api = await serverApi();
    const [
        trucks,
        items,
        person,
        venue

    ] = await Promise.all([
        api.truck.list(), api.item.list(), api.person.list(), api.venue.list()
    ]);





    return (
        
        <div>
            <ScanToCreate
                trucks={trucks.map(t => ({ id: t.id, name: t.name }))}
                parentOptions={items.map(i => ({ id: i.id, label: `${i.itemType} — ${i.subtype ?? i.identifier ?? "item"}` }))}
                people={person.map(p => ({ id: p.id, name: p.name }))}
                venues={venue.map(v => ({ id: v.id, name: v.name }))}
                        
            
            
            
            />
        </div>

    );

};