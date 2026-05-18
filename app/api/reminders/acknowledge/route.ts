import { type NextRequest } from "next/server";
import { verifyAcknowledgeToken } from "@/lib/reminders/token";
import { acknowledgeDispatch } from "@/lib/reminders/dispatch";

/**
 * One-click acknowledge link target (REST, not tRPC — it's an external link
 * clicked from an email). The signed token is the authorization; no login
 * required. Acknowledgement is ONLY ever the result of the user clicking
 * this — never automatic (brief "never do").
 */
function page(title: string, body: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
     <body style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:420px;margin:64px auto;padding:0 20px;color:#171717;text-align:center">
       <p style="color:#16a34a;font-weight:600">PermitKeep</p>
       <h1 style="font-size:20px">${ok ? "✓ " : ""}${title}</h1>
       <p style="color:#555;font-size:14px;line-height:1.5">${body}</p>
     </body></html>`,
    {
      status: ok ? 200 : 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const dispatchId = token ? verifyAcknowledgeToken(token) : null;

  if (!dispatchId) {
    return page(
      "Link expired or invalid",
      "This acknowledge link is no longer valid (links expire after 14 days). Open the item in PermitKeep to acknowledge there.",
      false,
    );
  }

  const result = await acknowledgeDispatch(dispatchId);
  if (!result.ok) {
    return page(
      "Reminder not found",
      "We couldn't find that reminder. It may have been removed.",
      false,
    );
  }
  return page(
    result.alreadyAcked ? "Already acknowledged" : "Reminder acknowledged",
    result.alreadyAcked
      ? "You'd already acknowledged this one — nothing else to do."
      : "Thanks — we've recorded that you've seen this. You can close this tab.",
    true,
  );
}
