import Link from "next/link";

/**
 * Per-truck scope switcher (server component). Renders "All trucks" + a tab per
 * truck linking to `${basePath}?truck=<id>`. Hidden when there's ≤1 truck
 * (single-truck operators don't need it).
 */
export function TruckScopeTabs({
  basePath,
  trucks,
  selectedTruckId,
}: {
  basePath: string;
  trucks: { id: string; name: string }[];
  selectedTruckId?: string;
}) {
  if (trucks.length <= 1) return null;
  const cls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "bg-background text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={basePath} className={cls(!selectedTruckId)}>
        All trucks
      </Link>
      {trucks.map((t) => (
        <Link
          key={t.id}
          href={`${basePath}?truck=${t.id}`}
          className={cls(selectedTruckId === t.id)}
        >
          {t.name}
        </Link>
      ))}
    </div>
  );
}
