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
  kind: "truck" | "item" | "commissary" | "venue" | "person";
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
  const personArchive = trpc.person.archive.useMutation({ onSuccess });
  const pending =
    truckArchive.isPending ||
    itemArchive.isPending ||
    commissaryArchive.isPending ||
    venueArchive.isPending ||
    personArchive.isPending;

  function go() {
    if (kind === "truck") truckArchive.mutate({ id });
    else if (kind === "item") itemArchive.mutate({ id });
    else if (kind === "commissary") commissaryArchive.mutate({ id });
    else if (kind === "venue") venueArchive.mutate({ id });
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
