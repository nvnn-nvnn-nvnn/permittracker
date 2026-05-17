import { inngest } from "@/inngest/client";
import { runExtractionForFile } from "@/lib/extraction/run";

/**
 * Background OCR job. Triggered by the "file/uploaded" event the file router
 * emits after a successful upload. Inngest retries on failure; the runner
 * marks the file 'failed' with the error message on a terminal failure.
 *
 * Inngest v4: createFunction(options, handler) — triggers live in options.
 */
export const extractDocumentJob = inngest.createFunction(
  { id: "extract-document", retries: 2, triggers: [{ event: "file/uploaded" }] },
  async ({ event, step }) => {
    const fileId = (event.data as { fileId: string }).fileId;
    return step.run("run-extraction", () => runExtractionForFile(fileId));
  },
);
