import type { EventStatus } from "@/lib/db/schema";

/** Display metadata for each application status. `open` = still in the active
 *  pipeline (vs. a terminal outcome). Badge variants match components/ui/badge. */
export const EVENT_STATUS_META: Record<
  EventStatus,
  { label: string; variant: "outline" | "red" | "yellow" | "green"; open: boolean }
> = {
  interested: { label: "Interested", variant: "outline", open: true },
  applied: { label: "Applied", variant: "yellow", open: true },
  waitlisted: { label: "Waitlisted", variant: "yellow", open: true },
  accepted: { label: "Accepted", variant: "green", open: true },
  confirmed: { label: "Confirmed", variant: "green", open: true },
  rejected: { label: "Rejected", variant: "red", open: false },
  withdrawn: { label: "Withdrawn", variant: "outline", open: false },
  attended: { label: "Attended", variant: "outline", open: false },
};

/** Pipeline order for grouping/sorting. */
export const EVENT_STATUS_ORDER: EventStatus[] = [
  "interested",
  "applied",
  "waitlisted",
  "accepted",
  "confirmed",
  "rejected",
  "withdrawn",
  "attended",
];
