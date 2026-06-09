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
- [X] **Stripe**: live-mode `STRIPE_SECRET_KEY`
- [—] **Twilio**: **DEFERRED at launch** — A2P 10DLC registration not yet
      submitted. SMS + voice channels disabled; pricing copy marks them
      "Coming soon". Re-enable: submit A2P, set
      `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`, revert pricing copy.
- [—] **Postmark**: **DEFERRED at launch** — inbound email parsing not
      wired in prod. The "forward to `{slug}@inbound.permitkeep.com`" channel
      is disabled; users add items via UI + OCR upload instead. Re-enable:
      stand up the Postmark inbound server, set `POSTMARK_INBOUND_SECRET`,
      un-hide the inbound affordance. See `00-decisions.md` → Known caveats.
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

- [x] `npm run stripe:setup` against the **live** account (creates
      products/prices by `lookup_key`)
- [x] Stripe Dashboard → Webhooks → endpoint `https://<domain>/api/webhooks/
      stripe`; set signing secret → `STRIPE_WEBHOOK_SECRET`
- [x] Test: real Checkout in live mode → plan tier updates via webhook
- [x] Test: Customer Portal opens; cancel → `plan_status` reflects it
- [—] Concierge one-time purchase: **DEFERRED at launch** (feature hidden
      in UI; webhook + admin queue + schema preserved). Re-test once the
      button in `billing-panel.tsx` is uncommented. See
      `00-decisions.md` → Known caveats.
- [x] Confirm tax/receipts/dunning settings in Stripe

## 4. Deploy (Vercel)

- [x] Vercel project created, **all** env vars set (prod values from §1)
- [x] Custom domain + TLS; Supabase Auth Site URL matches it
- [x] Inngest prod app registered; `/api/inngest` reachable; cron jobs
      listed (reminders */5, monthly digest)
- [~] Webhook routes reachable over HTTPS (Stripe/Postmark/Twilio-inbound/
      Twilio-voice) — they use `runtime="nodejs"`; confirm raw-body sig
      verification works on Vercel
- [x] First prod smoke test: sign up → create truck → item → dashboard
      status renders

## 5. Observability (currently UNWIRED — real work)

- [X] Sentry wired (server + client); **scrub** permit/COI numbers &
      extracted document text (brief "never log" rule)
- [~] PostHog wired; same PII exclusion
- [X] Alert on `/admin` dispatch-monitor failures + webhook 5xx
- [X] Uptime check on `/` and `/api/inngest`

## 6. Manual QA pass (go feature-by-feature in prod or staging)

- [X] **Auth**: email+password signup, magic link, logout, redirect gating
- [x] **Tenant isolation**: 2 accounts; confirm neither sees the other's
      trucks/items (the core security promise)
- [X] **Items/Trucks/Commissary/Venue/Person CRUD** + archive (never hard
      delete; audit trail row appears)
- [X] **Dashboard** RED/YELLOW/GREEN: expired item on active truck → RED;
      commissary cascade; person-cert cross-truck cascade
- [X] **OCR**: upload a real permit → proposal → apply → fields land; low
      expiry confidence → manual-review banner
- [X] **Reminders**: item expiring soon → dispatch scheduled → "Run due
      now" → email arrives → acknowledge link works; unacked >48h → YELLOW
- [—] **SMS**: deferred at launch (see §1 Twilio). Re-enable once A2P
      live: reminder text; reply "OK" acks.
- [—] **Voice**: deferred at launch (see §1 Twilio). Re-enable once A2P
      live: 7-day escalation call; press 1 acks; skipped if prior
      reminder already acked.
- [—] **Inbound email**: **deferred at launch** (see §1 Postmark). Channel
      disabled in prod. Core still testable via the Settings simulator:
      forward → classified, matched or draft created. Re-enable once the
      Postmark inbound server is live.
- [ ] **Billing limits**: Starter at cap → create blocked with upgrade
      prompt
- [X] **Admin** (`/admin`): only platform-admin; queue actions resolve +
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

- [ ] Terms of Service + Privacy Policyy
- [ ] "Advisory, not legal advice" disclaimer on digest/compliance copy
      reviewed by counsel
- [ ] Data-deletion / account-closure process (soft-delete + audit exists;
      define the GDPR/CCPA path)
- [—] SMS opt-in language: deferred at launch with Twilio (see §1).
      Required once A2P 10DLC is approved and SMS reminders go live.
      Adjust the UI, and fix the dashboard , seperate items checklist for each distinct item. 

---

### Reality check

Items in **§1–4, §6 (SMS/voice/inbound), §8** are *configuration,
deployment, and process* — fast, because everything is behind typed
adapters + env. The genuine remaining **engineering** is **§5
(observability)** and **§7 (tests + review)**. Do §7 before real customer
data lands — it's a compliance product.
