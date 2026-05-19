import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Voice adapter. Real Twilio Programmable Voice (via REST, no SDK) when
 * creds are set; otherwise a no-op that logs. Same seam as email/SMS.
 */
export interface PlaceCallInput {
  to: string;
  /** Inline TwiML executed when the callee answers. */
  twiml: string;
}

export interface VoiceAdapter {
  call(input: PlaceCallInput): Promise<{ sid: string }>;
}

const noopVoiceAdapter: VoiceAdapter = {
  async call(input) {
    console.warn(`[voice:stub] would call ${input.to}`);
    return { sid: `stub-${Date.now()}` };
  },
};

function twilioVoiceAdapter(
  sid: string,
  token: string,
  from: string,
): VoiceAdapter {
  return {
    async call(input) {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: from,
            To: input.to,
            Twiml: input.twiml,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`Twilio voice ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as { sid?: string };
      return { sid: json.sid ?? `twilio-${Date.now()}` };
    },
  };
}

let _adapter: VoiceAdapter | null = null;
export function getVoiceAdapter(): VoiceAdapter {
  if (_adapter) return _adapter;
  const env = serverEnv();
  _adapter =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
      ? twilioVoiceAdapter(
          env.TWILIO_ACCOUNT_SID,
          env.TWILIO_AUTH_TOKEN,
          env.TWILIO_FROM_NUMBER,
        )
      : noopVoiceAdapter;
  return _adapter;
}

/**
 * TwiML for the escalation call: read the alert, gather one digit, POST to
 * `actionUrl` (which carries a signed token). Pressing 1 acknowledges.
 */
export function buildEscalationTwiml(args: {
  spoken: string;
  actionUrl: string;
}): string {
  const safe = args.spoken.replace(/[<&]/g, " ");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather numDigits="1" method="POST" action="${args.actionUrl}">` +
    `<Say>${safe} Press 1 to acknowledge this reminder.</Say>` +
    `</Gather>` +
    `<Say>No input received. Goodbye.</Say>` +
    `</Response>`
  );
}
