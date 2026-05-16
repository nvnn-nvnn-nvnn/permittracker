import "server-only";

/**
 * SMS/voice adapter (Twilio in Phases 7–8). Stubbed for now.
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

export const smsAdapter: SmsAdapter = noopSmsAdapter;
