# PermitKeep — Launch Checklist

A manual, go-down-the-list path from **feature-complete** → **production &
release ready**. Tick each box; "Verify" lines tell you how to *prove* it,
not just assume it. Order is roughly the order to do it in.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done.
Source of caveats this expands on: `00-decisions.md` → Known caveats.

---

## 0. Pre-flight (local, before any prod work)

- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm run build` clean (then `rm -rf .next` before `npm run dev` again)
- [x] Working tree committed (`git status` clean)
- [x] Read `00-decisions.md` Known caveats end-to-end so nothing below is a
      surprise

## 1. Provision production accounts + secrets

Use **separate** prod keys — never reuse dev. All flow through
`lib/env.ts`; this is config, not code.

- [x] **Supabase**: new *production* project created
- [x] `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (prod)
- [x] Supabase → Auth → URL config: Site URL = prod domain, redirect
      `https://<domain>/auth/callback`
- [x] **Anthropic**: prod key in its own workspace → `ANTHROPIC_API_KEY`
- [ ] **Resend**: verified sending domain; `EMAIL_FROM` = address on it
      (dev `onboarding@resend.dev` only mails you)
- [ ] **Stripe**: live-mode `STRIPE_SECRET_KEY`
- [ ] **Twilio**: A2P 10DLC **registration submitted** (weeks-long — start
      first); `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`
- [ ] **Postmark**: inbound server + `POSTMARK_INBOUND_SECRET`
- [x] `REMINDER_TOKEN_SECRET` = fresh long random, **different from dev**
- [x] `APP_URL` = production https URL
- [ ] Inngest prod: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`

## 2. Production database

- [x] `npm run db:migrate` against prod `DATABASE_URL` (all migrations
      0000→latest)
- [x] Verify RLS ON for every tenant table; `permitkeep_audit` triggers
      present; `audit_log` UPDATE/DELETE blocked (re-run the Phase 2
      append-only probe against prod)
- [x] Verify the digest shared-read policy + all member-select policies
- [x] Seed one platform admin:
      `update app_user set is_platform_admin = true where email = '<you>';`
- [~] Enable Supabase automated backups / PITR
- [x] Confirm Storage bucket `documents` exists + is **private** in prod

## 3. Stripe catalog + webhook

- [ ] `npm run stripe:setup` against the **live** account (creates
      products/prices by `lookup_key`)
- [ ] Stripe Dashboard → Webhooks → endpoint `https://<domain>/api/webhooks/
      stripe`; set signing secret → `STRIPE_WEBHOOK_SECRET`
- [ ] Test: real Checkout in live mode → plan tier updates via webhook
- [ ] Test: Customer Portal opens; cancel → `plan_status` reflects it
- [ ] Test: concierge one-time purchase → `concierge_purchased_at` set,
      shows in `/admin` queue
- [ ] Confirm tax/receipts/dunning settings in Stripe

## 4. Deploy (Vercel)

- [ ] Vercel project created, **all** env vars set (prod values from §1)
- [ ] Custom domain + TLS; Supabase Auth Site URL matches it
- [ ] Inngest prod app registered; `/api/inngest` reachable; cron jobs
      listed (reminders */5, monthly digest)
- [ ] Webhook routes reachable over HTTPS (Stripe/Postmark/Twilio-inbound/
      Twilio-voice) — they use `runtime="nodejs"`; confirm raw-body sig
      verification works on Vercel
- [ ] First prod smoke test: sign up → create truck → item → dashboard
      status renders

## 5. Observability (currently UNWIRED — real work)

- [ ] Sentry wired (server + client); **scrub** permit/COI numbers &
      extracted document text (brief "never log" rule)
- [ ] PostHog wired; same PII exclusion
- [ ] Alert on `/admin` dispatch-monitor failures + webhook 5xx
- [ ] Uptime check on `/` and `/api/inngest`

## 6. Manual QA pass (go feature-by-feature in prod or staging)

- [ ] **Auth**: email+password signup, magic link, logout, redirect gating
- [ ] **Tenant isolation**: 2 accounts; confirm neither sees the other's
      trucks/items (the core security promise)
- [ ] **Items/Trucks/Commissary/Venue/Person CRUD** + archive (never hard
      delete; audit trail row appears)
- [ ] **Dashboard** RED/YELLOW/GREEN: expired item on active truck → RED;
      commissary cascade; person-cert cross-truck cascade
- [ ] **OCR**: upload a real permit → proposal → apply → fields land; low
      expiry confidence → manual-review banner
- [ ] **Reminders**: item expiring soon → dispatch scheduled → "Run due
      now" → email arrives → acknowledge link works; unacked >48h → YELLOW
- [ ] **SMS** (once Twilio live + A2P): reminder text; reply "OK" acks
- [ ] **Voice** (once Twilio live): 7-day escalation call; press 1 acks;
      skipped if prior reminder already acked
- [ ] **Inbound email**: forward to `{slug}@inbound.permitkeep.com` →
      classified, matched or draft created (test via Settings simulator if
      Postmark not live yet)
- [ ] **Billing limits**: Starter at cap → create blocked with upgrade
      prompt
- [ ] **Admin** (`/admin`): only platform-admin; queue actions resolve +
      audit as the admin
- [ ] **Digest**: monthly inspection-prep digest renders + emails

## 7. Tests & review (the engineering gap)

- [ ] Automated tests for security-critical paths: RLS tenant isolation,
      audit append-only, billing `limitedProcedure`, signed-token
      verify/expiry, cascade status engine
- [ ] Webhook signature-verification tests (Stripe/Postmark/Twilio)
- [ ] Independent security review (auth, RLS, service-role boundary,
      cross-tenant `/admin`)
- [ ] Load test the */5 reminder cron at realistic volume

## 8. Legal / product

- [ ] Terms of Service + Privacy Policy
- [ ] "Advisory, not legal advice" disclaimer on digest/compliance copy
      reviewed by counsel
- [ ] Data-deletion / account-closure process (soft-delete + audit exists;
      define the GDPR/CCPA path)
- [ ] SMS opt-in language matches the A2P 10DLC campaign

---

### Reality check

Items in **§1–4, §6 (SMS/voice/inbound), §8** are *configuration,
deployment, and process* — fast, because everything is behind typed
adapters + env. The genuine remaining **engineering** is **§5
(observability)** and **§7 (tests + review)**. Do §7 before real customer
data lands — it's a compliance product.
