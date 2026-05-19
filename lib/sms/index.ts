import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * SMS adapter. Real Twilio (via REST, no SDK dependency) when creds are set;
 * otherwise a no-op that logs. Call sites only import `getSmsAdapter()`.
 */
export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SmsAdapter {
  send(input: SendSmsInput): Promise<{ sid: string }>;
}

const noopSmsAdapter: SmsAdapter = {
  async send(input) {
    console.warn(`[sms:stub] would text ${input.to}: ${input.body}`);
    return { sid: `stub-${Date.now()}` };
  },
};

function twilioAdapter(
  sid: string,
  token: string,
  from: string,
): SmsAdapter {
  return {
    async send(input) {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: from,
            To: input.to,
            Body: input.body,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(`Twilio ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as { sid?: string };
      return { sid: json.sid ?? `twilio-${Date.now()}` };
    },
  };
}

let _adapter: SmsAdapter | null = null;
export function getSmsAdapter(): SmsAdapter {
  if (_adapter) return _adapter;
  const env = serverEnv();
  _adapter =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
      ? twilioAdapter(
          env.TWILIO_ACCOUNT_SID,
          env.TWILIO_AUTH_TOKEN,
          env.TWILIO_FROM_NUMBER,
        )
      : noopSmsAdapter;
  return _adapter;
}

/** True when real Twilio creds are configured. */
export function isSmsConfigured(): boolean {
  const env = serverEnv();
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_FROM_NUMBER,
  );
}
