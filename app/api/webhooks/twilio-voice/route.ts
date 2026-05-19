import { verifyAcknowledgeToken } from "@/lib/reminders/token";
import { acknowledgeDispatch } from "@/lib/reminders/dispatch";

export const runtime = "nodejs";

/**
 * Twilio Voice <Gather> callback for the 7-day escalation call. The action
 * URL carries the same signed acknowledge token used by email/SMS links, so
 * "press 1" is just another authenticated path into acknowledgeDispatch().
 * Only the user pressing 1 acknowledges — never automatic.
 */
function say(message: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${message}</Say></Response>`,
    { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } },
  );
}

export async function POST(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  const dispatchId = token ? verifyAcknowledgeToken(token) : null;
  if (!dispatchId) return say("This reminder link has expired. Goodbye.");

  const form = await req.formData();
  const digits = String(form.get("Digits") ?? "");
  if (digits !== "1") {
    return say("No acknowledgement received. Goodbye.");
  }

  const result = await acknowledgeDispatch(dispatchId);
  return say(
    result.ok
      ? "Thank you. This reminder has been acknowledged. Goodbye."
      : "We could not find that reminder. Goodbye.",
  );
}
