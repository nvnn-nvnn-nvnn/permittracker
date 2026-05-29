import type { itemTypeValues } from "@/lib/validators";

export type ChecklistTier = "essential" | "recommended" | "situational";

export type ChecklistEntry = {
  id: string;
  title: string;
  description: string;
  itemType: (typeof itemTypeValues)[number];
  subtype: string;
  tier: ChecklistTier;
  /** Substrings (lower-cased) used to detect whether an existing item
   *  already satisfies this row. Matched against subtype + identifier. */
  match: string[];
};

export const CHECKLIST: ChecklistEntry[] = [
  // --- Essential ---------------------------------------------------------
  {
    id: "mobile-food-permit",
    title: "Mobile food vendor permit",
    description:
      "The core city/county permit that lets you operate a mobile food unit.",
    itemType: "permit",
    subtype: "Mobile food unit permit",
    tier: "essential",
    match: ["mobile food", "food unit", "food vendor", "food truck permit"],
  },
  {
    id: "health-inspection",
    title: "Health department inspection",
    description:
      "Routine inspection from the local health authority. Track the date the next one is due.",
    itemType: "inspection",
    subtype: "Health department inspection",
    tier: "essential",
    match: ["health", "health dept", "health department"],
  },
  {
    id: "general-liability",
    title: "General liability insurance (COI)",
    description:
      "Liability coverage venues and events almost always require. Track expiry of the policy.",
    itemType: "coi",
    subtype: "General liability",
    tier: "essential",
    match: ["general liability", "gl coi", "liability"],
  },
  {
    id: "auto-insurance",
    title: "Commercial vehicle insurance",
    description:
      "Auto policy on the truck itself. Often separate from your general liability policy.",
    itemType: "coi",
    subtype: "Commercial auto insurance",
    tier: "essential",
    match: ["auto insurance", "commercial auto", "vehicle insurance"],
  },
  {
    id: "vehicle-registration",
    title: "Vehicle registration",
    description: "State DMV registration / tabs on the truck.",
    itemType: "vehicle",
    subtype: "Vehicle registration",
    tier: "essential",
    match: ["registration", "tabs", "dmv"],
  },
  {
    id: "sales-tax-permit",
    title: "Sales tax permit",
    description:
      "State permit authorizing you to collect and remit sales tax.",
    itemType: "permit",
    subtype: "Sales tax permit",
    tier: "essential",
    match: ["sales tax"],
  },

  // --- Recommended (most operators need these) ---------------------------
  {
    id: "fire-suppression",
    title: "Fire suppression / hood inspection",
    description:
      "Ansul or equivalent suppression system inspection — typically every 6 months. Easy to forget.",
    itemType: "inspection",
    subtype: "Fire suppression (Ansul / hood)",
    tier: "recommended",
    match: ["fire suppression", "ansul", "hood inspection"],
  },
  {
    id: "lp-gas-cert",
    title: "LP-gas / propane certification",
    description:
      "NFPA 58 propane equipment inspection — required if you cook with propane.",
    itemType: "certification",
    subtype: "LP-gas / propane",
    tier: "recommended",
    match: ["propane", "lp-gas", "lp gas", "nfpa 58"],
  },
  {
    id: "food-manager",
    title: "Certified Food Manager (ServSafe)",
    description:
      "ServSafe / CFPM certification for at least one person on-site. Attach to the person who holds it.",
    itemType: "certification",
    subtype: "Certified Food Protection Manager (ServSafe)",
    tier: "recommended",
    match: ["servsafe", "cfpm", "food manager", "food protection manager"],
  },
  {
    id: "food-handler",
    title: "Food handler card(s)",
    description:
      "Per-worker food handler card where required. Add one item per worker, attached to that person.",
    itemType: "certification",
    subtype: "Food handler card",
    tier: "recommended",
    match: ["food handler"],
  },
  {
    id: "commissary-agreement",
    title: "Commissary agreement letter",
    description:
      "Signed letter from your commissary. Even if you've set up a commissary record, keep the dated agreement on file.",
    itemType: "certification",
    subtype: "Commissary agreement",
    tier: "recommended",
    match: ["commissary agreement", "commissary letter"],
  },

  // --- Situational -------------------------------------------------------
  {
    id: "workers-comp",
    title: "Workers' compensation insurance",
    description: "Required in most states once you have employees.",
    itemType: "coi",
    subtype: "Workers' compensation",
    tier: "situational",
    match: ["workers comp", "workers' comp", "wc coi"],
  },
  {
    id: "business-license",
    title: "Business license / DBA",
    description:
      "City/state business registration or DBA filing — separate from the vendor permit.",
    itemType: "permit",
    subtype: "Business license / DBA",
    tier: "situational",
    match: ["business license", "dba"],
  },
  {
    id: "dot-medical",
    title: "DOT medical card",
    description:
      "Required for drivers of certain commercial vehicles. Attach to the person.",
    itemType: "certification",
    subtype: "DOT medical card",
    tier: "situational",
    match: ["dot medical", "dot card", "medical card"],
  },
  {
    id: "special-event-permit",
    title: "Special-event permit",
    description:
      "One-off event/festival permits. Add one per event so the expiry is tracked.",
    itemType: "permit",
    subtype: "Special-event permit",
    tier: "situational",
    match: ["special event", "event permit"],
  },
];

type Matchable = {
  itemType: (typeof itemTypeValues)[number];
  subtype: string | null;
  identifier: string | null;
};

export function isChecklistEntrySatisfied(
  entry: ChecklistEntry,
  items: Matchable[],
): boolean {
  const needles = entry.match;
  for (const it of items) {
    if (it.itemType !== entry.itemType) continue;
    const hay = `${it.subtype ?? ""} ${it.identifier ?? ""}`.toLowerCase();
    if (needles.some((n) => hay.includes(n))) return true;
  }
  return false;
}

export const TIER_LABEL: Record<ChecklistTier, string> = {
  essential: "Essential",
  recommended: "Recommended",
  situational: "Situational",
};

export const TIER_BLURB: Record<ChecklistTier, string> = {
  essential: "Almost every mobile food operator needs these.",
  recommended: "Easy to forget — most operators are required to track them.",
  situational: "Add these if they apply to your operation.",
};
