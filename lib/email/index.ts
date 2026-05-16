import "server-only";

/**
 * Outbound email adapter (Resend in Phase 4). Stubbed for now — call sites
 * import `emailAdapter`; only this binding changes when Resend is wired.
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
    console.warn(
      `[email:stub] would send "${input.subject}" to ${input.to}`,
    );
    return { id: `stub-${Date.now()}` };
  },
};

export const emailAdapter: EmailAdapter = noopEmailAdapter;
