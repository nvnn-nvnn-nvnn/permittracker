import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { processInboundEmail, type InboundAttachment } from "@/lib/inbound/process";
import * as Sentry from '@sentry/nextjs';
export const runtime = "nodejs";

/**
 * Postmark inbound parsing → forward-to-inbox.
 *
 * Each account has {slug}@inbound.permitkeep.com. Postmark POSTs the parsed
 * email here. Postmark doesn't sign inbound payloads, so the endpoint is
 * protected by a shared secret in the query string (`?secret=`); if
 * POSTMARK_INBOUND_SECRET is unset (dev), the check is skipped.
 *
 * The real work lives in processInboundEmail() — the dev simulator calls the
 * exact same core, so behaviour is identical.
 */
interface PostmarkInbound {
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  OriginalRecipient?: string;
  ToFull?: { Email: string }[];
  Attachments?: { Name: string; Content: string; ContentType: string }[];
}

function recipientLocalPart(p: PostmarkInbound): string | null {
  const addr =
    p.OriginalRecipient || p.ToFull?.[0]?.Email || "";
  const at = addr.indexOf("@");
  return at > 0 ? addr.slice(0, at).toLowerCase() : null;
}

export async function POST(req: Request): Promise<Response> {
  const secret = serverEnv().POSTMARK_INBOUND_SECRET;
  if (secret) {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== secret) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let payload: PostmarkInbound;
  try {
    payload = (await req.json()) as PostmarkInbound;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const slug = recipientLocalPart(payload);
  if (!slug) return new Response("No recipient", { status: 422 });

  const [acct] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(eq(account.slug, slug))
    .limit(1);
  // 200 even when unknown: Postmark must not retry an unroutable address.
  if (!acct) return new Response("Unknown inbox", { status: 200 });

  const attachments: InboundAttachment[] = (payload.Attachments ?? []).map(
    (a) => ({
      filename: a.Name,
      contentType: a.ContentType,
      base64: a.Content,
    }),
  );

  try {
    const result = await processInboundEmail(acct.id, {
      from: payload.From ?? "",
      subject: payload.Subject ?? "(no subject)",
      body: payload.TextBody || payload.HtmlBody || "",
      attachments,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {

    Sentry.captureException(err, { tags: { type: "webhook_5xx", webhook: "postmark" } });


    const m = err instanceof Error ? err.message : "inbound error";
    
    return new Response(`Handler error: ${m}`, { status: 500 });
  }
}
