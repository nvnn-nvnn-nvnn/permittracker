import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Enforces the brief's "never log permit/COI numbers or extracted document
 * text" rule before any event leaves the process. Defense-in-depth on top of
 * `sendDefaultPii: false`.
 */
const SENSITIVE_KEYS = [
  "extractedText", "documentText", "ocrText", "rawText",
  "permitNumber", "permit_number", "coiNumber", "coi_number",
  "rawBody", "body",
];

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
  }
  if (event.extra) {
    for (const key of SENSITIVE_KEYS) delete event.extra[key];
  }
  return event;
}
