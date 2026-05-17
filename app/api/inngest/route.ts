import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractDocumentJob } from "@/inngest/functions/extract";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [extractDocumentJob],
});
