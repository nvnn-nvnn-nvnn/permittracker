import {
  Stamp,
  ClipboardCheck,
  BadgeCheck,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { ItemType } from "@/lib/db/schema";

/** Shared display metadata for the five compliance item types. */
export const TYPE_ORDER: ItemType[] = [
  "permit",
  "inspection",
  "certification",
  "coi",
  "vehicle",
];

export const TYPE_LABEL: Record<ItemType, string> = {
  permit: "Permits",
  inspection: "Inspections",
  certification: "Certifications",
  coi: "Insurance (COIs)",
  vehicle: "Vehicle",
};

export const TYPE_ICON: Record<ItemType, LucideIcon> = {
  permit: Stamp,
  inspection: ClipboardCheck,
  certification: BadgeCheck,
  coi: ShieldCheck,
  vehicle: Truck,
};
