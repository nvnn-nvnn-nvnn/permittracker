import "server-only";
import type { ComplianceItem, ReminderDispatch } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";

/**
 * Build the reminder email. Plain, mobile-first, one clear action: the
 * one-click acknowledge link (signed token). We never claim the item is
 * renewed — we only warn it's coming due.
 */
export function buildReminderEmail(args: {
  item: Pick<
    ComplianceItem,
    "itemType" | "subtype" | "identifier" | "jurisdiction" | "expirationDate"
  >;
  dispatch: Pick<ReminderDispatch, "kind" | "offsetDays">;
  acknowledgeUrl: string;
  itemUrl: string;
}): { subject: string; html: string; text: string } {
  const { item, dispatch } = args;
  const label =
    item.subtype || item.identifier || item.itemType.toUpperCase();
  const isFee = dispatch.kind === "fee";
  const when = fmtDate(item.expirationDate);

  const subject = isFee
    ? `Fee due soon — ${label}`
    : dispatch.offsetDays === 0
      ? `Expires TODAY — ${label}`
      : `Expires in ${dispatch.offsetDays} days — ${label}`;

  const lead = isFee
    ? `A renewal fee for "${label}" is coming up (expiration ${when}).`
    : `Your ${item.itemType} "${label}" expires on ${when}.`;

  const text = [
    lead,
    item.jurisdiction ? `Jurisdiction: ${item.jurisdiction}` : "",
    "",
    `Acknowledge this reminder: ${args.acknowledgeUrl}`,
    `View the item: ${args.itemUrl}`,
    "",
    "PermitKeep — stay open.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;color:#171717">
    <p style="font-size:14px;color:#16a34a;font-weight:600;margin:0 0 8px">PermitKeep</p>
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h1>
    <p style="font-size:14px;line-height:1.5">${escapeHtml(lead)}</p>
    ${
      item.jurisdiction
        ? `<p style="font-size:13px;color:#666">Jurisdiction: ${escapeHtml(
            item.jurisdiction,
          )}</p>`
        : ""
    }
    <p style="margin:20px 0">
      <a href="${args.acknowledgeUrl}"
         style="background:#171717;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block">
        Acknowledge reminder
      </a>
    </p>
    <p style="font-size:13px"><a href="${args.itemUrl}" style="color:#171717">View the item in PermitKeep</a></p>
    <p style="font-size:12px;color:#999;margin-top:24px">
      You're receiving this because PermitKeep tracks this compliance item for
      your account. Only you can acknowledge it — we never do it for you.
    </p>
  </div>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
