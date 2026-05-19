import { inngest } from "@/inngest/client";
import { runMonthlyDigests } from "@/lib/digest/run";

/**
 * Monthly inspection-prep digest — 1st of each month, 13:00 UTC. Generates
 * any missing per-jurisdiction digests and emails each account its set.
 * The admin "generate & send now" action calls runMonthlyDigests() too, so
 * behaviour is identical (same cron+manual pattern as every prior phase).
 */
export const monthlyDigestCron = inngest.createFunction(
  { id: "monthly-inspection-digest", triggers: [{ cron: "0 13 1 * *" }] },
  async ({ step }) => {
    return step.run("run-digests", () => runMonthlyDigests());
  },
);
