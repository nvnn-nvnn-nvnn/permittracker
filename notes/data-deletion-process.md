# VendGuard — Data Deletion & Account Closure Runbook

Internal operating procedure for fulfilling data-deletion / account-closure
requests (GDPR Art. 17 "right to erasure" and CCPA "right to delete"). This is
the **process** that satisfies Launch Checklist §8. Keep it in sync with the
public Privacy Policy and the `deleteAccount` implementation.

> **Status:** placeholder values marked `[like this]` and the intake email must
> be finalized before launch. Intake email is **`raysarchive@proton.me`** —
> the Privacy Policy now matches (reconciled 2026-06-14).

---

## 1. Scope & legal basis

- **GDPR Art. 17** — data subjects may request erasure of their personal data.
- **CCPA** — California consumers may request deletion of personal information.
- Both laws **permit retention exceptions** (legal obligations, tax records,
  security/audit, and establishing/defending legal claims). We rely on those for
  the items in §6 ("Retained").

This applies to account owners and any personal data we hold about them. Under
our 1-user-per-account model, an account-closure request and an erasure request
are the same operation.

## 2. Intake

- Requests arrive at **`raysarchive@proton.me`** *(placeholder — see status note)*.
- Anything that reads as a deletion/closure/erasure request (in any wording)
  enters this process. Log receipt date immediately — it starts the SLA clock.

## 3. Identity verification (do this BEFORE deleting anything)

Erasure is irreversible, so verify the requester actually controls the account:

- Confirm the request comes from (or is validated against) the **account owner's
  email on file**. If it arrives from a different address, reply to the
  on-file address to confirm before proceeding.
- If identity cannot be established, do **not** delete — respond explaining what
  verification is needed.

## 4. SLA

- Acknowledge and complete within **30 days** of a verified request.
- For genuinely complex cases GDPR allows a 60-day extension — if invoked, notify
  the requester in writing within the first 30 days.

## 5. Who may execute

- **Platform admin only** (you). Execution is gated to `is_platform_admin` users
  via `/admin`. No one else can run a deletion.

## 6. What is deleted vs retained

**Deleted** (by `deleteAccount` — see `lib/account/delete.ts`):

- The `account` row and, by cascade, **all tenant data**: trucks, compliance
  items, commissaries, venues, people, file_attachments, extraction proposals/
  costs, reminder dispatches, memberships.
- The account's **audit_log** rows (via `purge_account_audit` — the one
  sanctioned exception to the append-only log).
- All **uploaded documents** in Supabase Storage under `accounts/{id}/`.
- The owner's **Supabase Auth identity** (login) and `app_user` profile row.
- The **Stripe subscription** (canceled).

**Retained** (with legal basis):

- **`account_deletion_log`** — proof-of-erasure record (account id/name/slug,
  who executed it, reason, timestamp). No sensitive personal data. Basis:
  demonstrating compliance / defending claims. **Retention: 3 years**, then purge.
- **Stripe customer + invoices** — basis: tax/financial-record retention law.
  We cancel the subscription but do **not** delete the customer or its invoices.
- **Encrypted backups / PITR** — the deletion is not retroactively applied to
  existing backups; those age out on their normal rotation and are not restored
  selectively.

## 7. Processor propagation (sub-processors)

`deleteAccount` directly clears data we control at **Supabase** (DB + Storage +
Auth) and **Stripe** (subscription). For the remaining processors, confirm no
residual personal data requires a separate deletion request, per their terms:

- **Vercel** (hosting/logs), **Anthropic** (OCR — no training on our data),
  **Resend** / **Postmark** (email logs), **Twilio** (SMS/voice logs),
  **Sentry** (errors — already scrubbed of permit/COI numbers + document text),
  **PostHog** (analytics — same PII exclusion).

If a requester specifically asks, issue deletion to these processors and record
it. (Most retain only minimal, time-limited logs.)

## 8. Execution steps

1. Verify identity (§3).
2. Sign in as platform admin → **`/admin`** → **"Danger zone · delete account"**.
3. Select the account; **type its exact slug** to confirm; enter a **reason**
   (e.g. "GDPR erasure request — <date> — <ref>"); confirm the dialog.
4. The tool runs `admin.deleteAccountPermanently` → `deleteAccount`.

## 9. Confirmation

- Email the requester from the intake address confirming the deletion is
  complete and what was retained and why (audit/proof record, tax invoices).

## 10. Record-keeping

- The `account_deletion_log` row is the durable proof a request was fulfilled
  (who/when/why). Retain **3 years**.
- Keep the request correspondence (intake → verification → confirmation)
  alongside it per the same retention.

---

### Open items before launch

- Finalize the **intake email** and make the Privacy Policy + this runbook agree.
- Fill placeholders: `[business legal name / address]`, effective dates.
- Optional: a scheduled job to purge `account_deletion_log` rows older than
  3 years (currently a manual retention step).
