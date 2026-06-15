"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { EVENT_STATUS_ORDER, EVENT_STATUS_META } from "@/lib/events";
import type { EventStatus } from "@/lib/db/schema";

/** Inline status changer. Persists via event.setStatus and refreshes server data. */
export function EventStatusSelect({
  id,
  status,
  className,
}: {
  id: string;
  status: EventStatus;
  className?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [value, setValue] = useState<EventStatus>(status);
  const setStatus = trpc.event.setStatus.useMutation({
    onSuccess: async () => {
      await utils.event.list.invalidate();
      router.refresh();
    },
  });

  return (
    <select
      aria-label="Application status"
      value={value}
      disabled={setStatus.isPending}
      onChange={(e) => {
        const next = e.target.value as EventStatus;
        setValue(next);
        setStatus.mutate({ id, status: next });
      }}
      className={
        className ??
        "h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-50"
      }
    >
      {EVENT_STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {EVENT_STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
