"use client";

// THROWAWAY — delete after verifying Sentry. Triggers a client-side error so
// we can confirm the browser SDK captures + the scrubber strips PII.
export default function SentryTestPage() {
  return (
    <button
      type="button"
      onClick={() => {
        // @ts-expect-error intentionally undefined to trigger a test error
        myUndefinedFunction();
      }}
      style={{ padding: 16, fontSize: 18 }}
    >
      Throw Sentry test error
    </button>
  );
}
