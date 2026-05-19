import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractDocumentJob } from "@/inngest/functions/extract";
import { dispatchRemindersCron } from "@/inngest/functions/reminders";
import { monthlyDigestCron } from "@/inngest/functions/digest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [extractDocumentJob, dispatchRemindersCron, monthlyDigestCron],
});
