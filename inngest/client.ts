import { Inngest } from "inngest";

/**
 * Inngest client. In local dev, run `npx inngest-cli@latest dev` alongside
 * `npm run dev`; it auto-discovers /api/inngest. Production uses
 * INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY (optional in dev).
 */
export const inngest = new Inngest({ id: "permitkeep" });

/** Event payloads we emit (kept here as the single source of truth). */
export type FileUploadedEvent = {
  name: "file/uploaded";
  data: { fileId: string };
};
