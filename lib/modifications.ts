import type { ReinspectionStatus } from "@/lib/db/schema";

/** Display meta for a modification's re-inspection status. */
export const REINSPECTION_META: Record<
  ReinspectionStatus,
  { label: string; variant: "green" | "yellow" | "red" | "outline" }
> = {
  not_required: { label: "No re-inspection", variant: "outline" },
  pending: { label: "Re-inspection needed", variant: "red" },
  scheduled: { label: "Re-inspection scheduled", variant: "yellow" },
  cleared: { label: "Cleared", variant: "green" },
};
