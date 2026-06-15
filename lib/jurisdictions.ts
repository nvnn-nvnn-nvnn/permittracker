/**
 * Default issuing-authority options for compliance items + content scope.
 * Intentionally location-agnostic; free-form entry is still allowed so users
 * can name the exact authority for their area.
 */
export const DEFAULT_JURISDICTIONS = [
  "State Department of Health",
  "State Department of Agriculture",
  "City Health Department",
  "City Dept. of Safety & Inspections",
  "County Health Department",
  "County Environmental Health",
] as const;

export type Jurisdiction =
  | (typeof DEFAULT_JURISDICTIONS)[number]
  | (string & {});
