import * as Sentry from "@sentry/nextjs"
import { scrubEvent } from "./lib/observability/scrub"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});