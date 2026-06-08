import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractDocumentJob } from "@/inngest/functions/extract";
import { dispatchRemindersCron } from "@/inngest/functions/reminders";
import { monthlyDigestCron } from "@/inngest/functions/digest";
import { dispatchHealthAlert } from "@/inngest/functions/dispatch-health";
import { orphanCleanupCron } from "@/inngest/functions/orphan-clearnup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    extractDocumentJob,
    dispatchRemindersCron,
    monthlyDigestCron,
    dispatchHealthAlert,
    orphanCleanupCron
  ],
});
