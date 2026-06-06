import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { recentDispatchFailures } from "@/lib/reminders/health";

/** Threshold + window for "too many dispatch failures piling up". A handful of
 *  transient failures (a Resend hiccup) is normal; this many in the window
 *  means something is actually broken and warrants a page. */
const WINDOW_MINUTES = 60;
const FAILURE_THRESHOLD = 5;

/**
 * Dispatch health alert — every 15 min. Watches the same `failed`
 * reminder_dispatch rows the `/admin` monitor displays, but on a schedule so it
 * fires even when no one is looking at the page. Over threshold → a Sentry
 * event (stable message → groups into one issue; wire a Sentry alert rule on
 * `type:dispatch_health` to email/Slack). `flush` because serverless functions
 * can exit before the SDK transmits.
 */
export const dispatchHealthAlert = inngest.createFunction(
  { id: "dispatch-health-alert", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const failures = await step.run("count-failures", () =>
      recentDispatchFailures(WINDOW_MINUTES),
    );
    if (failures >= FAILURE_THRESHOLD) {
      Sentry.captureMessage("Reminder dispatch failures over threshold", {
        level: "error",
        tags: { type: "dispatch_health" },
        extra: { failures, windowMinutes: WINDOW_MINUTES, threshold: FAILURE_THRESHOLD },
      });
      await Sentry.flush(2000);
    }
    return { failures, threshold: FAILURE_THRESHOLD, alerted: failures >= FAILURE_THRESHOLD };
  },
);
