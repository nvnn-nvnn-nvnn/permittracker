import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

/**
 * Outbound email adapter. Real Resend when RESEND_API_KEY is set; otherwise a
 * no-op that logs (so reminders never crash before the key is wired). Call
 * sites only ever import `emailAdapter` — the binding is chosen here.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailAdapter {
  send(input: SendEmailInput): Promise<{ id: string }>;
}

const noopEmailAdapter: EmailAdapter = {
  async send(input) {
    console.warn(`[email:stub] would send "${input.subject}" to ${input.to}`);
    return { id: `stub-${Date.now()}` };
  },
};

function resendAdapter(apiKey: string, from: string): EmailAdapter {
  const client = new Resend(apiKey);
  return {
    async send(input) {
      const { data, error } = await client.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? "",
      });
      if (error) throw new Error(`Resend: ${error.message}`);
      return { id: data?.id ?? `resend-${Date.now()}` };
    },
  };
}

/** Lazily resolved so build/stub paths don't require a key. */
let _adapter: EmailAdapter | null = null;
export function getEmailAdapter(): EmailAdapter {
  if (_adapter) return _adapter;
  const env = serverEnv();
  _adapter = env.RESEND_API_KEY
    ? resendAdapter(env.RESEND_API_KEY, env.EMAIL_FROM)
    : noopEmailAdapter;
  return _adapter;
}
