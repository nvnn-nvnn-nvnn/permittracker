import { acknowledgeBySmsReply } from "@/lib/reminders/dispatch";

export const runtime = "nodejs";

/**
 * Twilio inbound SMS webhook. A reply of "OK" acknowledges the most recent
 * SMS reminder for the account whose phone matches the sender. We respond
 * with empty TwiML so Twilio doesn't auto-reply. (Twilio request signature
 * validation is added when real Twilio creds/A2P 10DLC are live; the dev
 * simulator calls acknowledgeBySmsReply directly.)
 */
function twiml(message?: string): Response {
  const body = message
    ? `<Response><Message>${message}</Message></Response>`
    : "<Response></Response>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const body = String(form.get("Body") ?? "");
  if (!from) return twiml();

  const result = await acknowledgeBySmsReply(from, body);
  return twiml(
    result.ok ? "Thanks — reminder acknowledged." : undefined,
  );
}
