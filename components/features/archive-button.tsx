"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";

/**
 * Archive (soft-delete) a truck, item, or commissary. Never hard-deletes —
 * the row stays for the audit trail; the trigger logs action='archive'.
 */
export function ArchiveButton({
  kind,
  id,
  redirectTo,
}: {
  kind:
    | "truck"
    | "item"
    | "commissary"
    | "venue"
    | "person"
    | "event"
    | "ingredient"
    | "recipe"
    | "purchaseOrder"
    | "expense"
    | "modification";
  id: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);

  const onSuccess = async () => {
    if (kind === "truck") await utils.truck.list.invalidate();
    else if (kind === "item") await utils.item.list.invalidate();
    else if (kind === "commissary") await utils.commissary.list.invalidate();
    else if (kind === "venue") await utils.venue.list.invalidate();
    else if (kind === "event") await utils.event.list.invalidate();
    else if (kind === "ingredient") await utils.inventory.list.invalidate();
    else if (kind === "recipe") await utils.recipe.list.invalidate();
    else if (kind === "purchaseOrder")
      await utils.purchasing.list.invalidate();
    else if (kind === "expense") await utils.expenses.list.invalidate();
    else if (kind === "modification")
      await utils.modification.list.invalidate();
    else await utils.person.list.invalidate();
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  };
  const truckArchive = trpc.truck.archive.useMutation({ onSuccess });
  const itemArchive = trpc.item.archive.useMutation({ onSuccess });
  const commissaryArchive = trpc.commissary.archive.useMutation({
    onSuccess,
  });
  const venueArchive = trpc.venue.archive.useMutation({ onSuccess });
  const eventArchive = trpc.event.archive.useMutation({ onSuccess });
  const personArchive = trpc.person.archive.useMutation({ onSuccess });
  const ingredientArchive = trpc.inventory.archive.useMutation({ onSuccess });
  const recipeArchive = trpc.recipe.archive.useMutation({ onSuccess });
  const purchaseOrderArchive = trpc.purchasing.archive.useMutation({
    onSuccess,
  });
  const expenseArchive = trpc.expenses.archive.useMutation({ onSuccess });
  const modificationArchive = trpc.modification.archive.useMutation({
    onSuccess,
  });
  const pending =
    truckArchive.isPending ||
    itemArchive.isPending ||
    commissaryArchive.isPending ||
    venueArchive.isPending ||
    eventArchive.isPending ||
    personArchive.isPending ||
    ingredientArchive.isPending ||
    recipeArchive.isPending ||
    purchaseOrderArchive.isPending ||
    expenseArchive.isPending ||
    modificationArchive.isPending;

  function go() {
    if (kind === "truck") truckArchive.mutate({ id });
    else if (kind === "item") itemArchive.mutate({ id });
    else if (kind === "commissary") commissaryArchive.mutate({ id });
    else if (kind === "venue") venueArchive.mutate({ id });
    else if (kind === "event") eventArchive.mutate({ id });
    else if (kind === "ingredient") ingredientArchive.mutate({ id });
    else if (kind === "recipe") recipeArchive.mutate({ id });
    else if (kind === "purchaseOrder") purchaseOrderArchive.mutate({ id });
    else if (kind === "expense") expenseArchive.mutate({ id });
    else if (kind === "modification") modificationArchive.mutate({ id });
    else personArchive.mutate({ id });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Archive
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={go}
      >
        {pending ? "Archiving…" : "Confirm archive"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </span>
  );
}
