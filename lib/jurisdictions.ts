/**
 * Launch metro: Twin Cities, Minnesota. Default jurisdiction options for
 * compliance items + Phase 10 content scope. Free-form entry still allowed.
 */
export const MN_JURISDICTIONS = [
  "Minnesota Department of Health (MDH)",
  "Minnesota Department of Agriculture (MDA)",
  "Minneapolis Health Department",
  "Saint Paul Dept. of Safety & Inspections (DSI)",
  "Hennepin County",
  "Ramsey County",
] as const;

export type Jurisdiction = (typeof MN_JURISDICTIONS)[number] | (string & {});
