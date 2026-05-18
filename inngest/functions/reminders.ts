import { inngest } from "@/inngest/client";
import { processDueDispatches } from "@/lib/reminders/dispatch";

/**
 * Reminder dispatch cron — every 5 minutes (brief). Picks up due
 * reminder_dispatch rows and sends them. The manual "run now" tRPC mutation
 * calls the same processDueDispatches() so behaviour is identical.
 */
export const dispatchRemindersCron = inngest.createFunction(
  { id: "dispatch-reminders", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    return step.run("process-due", () => processDueDispatches());
  },
);
