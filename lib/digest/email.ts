import "server-only";
import type { JurisdictionDigest } from "@/lib/db/schema";
import { periodLabel } from "./period";

/** Monthly digest email — a teaser per jurisdiction + link to read in-app. */
export function buildDigestEmail(args: {
  period: string;
  digests: JurisdictionDigest[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const label = periodLabel(args.period);
  const subject = `Your ${label} inspection-prep digest`;

  const items = args.digests
    .map((d) => {
      const firstLine =
        d.contentMarkdown
          .replace(/^###\s*/gm, "")
          .split("\n")
          .find((l) => l.trim().length > 0) ?? "";
      return { j: d.jurisdiction, title: d.title, firstLine };
    })
    .filter(Boolean);

  const text = [
    `Inspection-prep digest — ${label}`,
    "",
    ...items.map((i) => `• ${i.j}: ${i.title}\n  ${i.firstLine}`),
    "",
    `Read it in CartLedger: ${args.appUrl}/digest`,
    "",
    "General guidance only — not legal advice.",
  ].join("\n");

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#231a12">
    <p style="font-size:13px;color:#b4541f;font-weight:600;margin:0 0 4px">CartLedger</p>
    <h1 style="font-size:19px;margin:0 0 14px">Inspection-prep digest · ${label}</h1>
    ${items
      .map(
        (i) => `<div style="margin:0 0 14px">
        <p style="font-size:12px;color:#8a7a68;margin:0">${escapeHtml(i.j)}</p>
        <p style="font-size:15px;font-weight:600;margin:2px 0">${escapeHtml(i.title)}</p>
        <p style="font-size:14px;color:#555;margin:0">${escapeHtml(i.firstLine)}</p>
      </div>`,
      )
      .join("")}
    <p style="margin:20px 0">
      <a href="${args.appUrl}/digest" style="background:#b4541f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block">Read the full digest</a>
    </p>
    <p style="font-size:12px;color:#999">General guidance for your area — not legal advice. Always confirm with your jurisdiction.</p>
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
