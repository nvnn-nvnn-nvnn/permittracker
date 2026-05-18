# PermitKeep — Decisions Log

This file records binding decisions and any stack deviations with rationale.
Newest entries at the top of each section.

## Project kickoff decisions (2026-05-16)

These were confirmed with the owner before any code was written.

1. **Credentials posture: "Supabase + Anthropic ready".**
   - Supabase (Postgres, Auth, Storage) and Anthropic (Claude vision) are treated
     as live integrations driven by env vars.
   - Stripe, Twilio, Resend, Postmark are **stubbed behind typed adapter
     interfaces** with local/no-op implementations until later phases. Swapping in
     real SDKs must not require touching call sites — only the adapter binding.
2. **Launch metro: Twin Cities, Minnesota** (Minneapolis + Saint Paul metro).
   - Jurisdiction seed data targets MN: Minnesota Dept of Health (MDH),
     Minnesota Dept of Agriculture (MDA), Minneapolis Health Dept,
     Saint Paul Dept of Safety & Inspections (DSI), Hennepin County,
     Ramsey County. Drives default jurisdiction options + Phase 10 content scope.
3. **Stack: follow the brief.** Deviations are permitted only when justified, and
   every deviation must be logged in the "Stack deviations" section below so the
   owner can review the what/why.
4. **Admin app: same Next.js app, route group `/admin`, role-gated** by a
   platform-admin flag. No separate deployment.

## Stack deviations

(none — building the brief's stack as written)

## Data-model scope decisions (not stack deviations)

- **Phase 2 — reminder offsets on the item, not a separate table.** The
  brief's ReminderSchedule defaults are stored as `compliance_item
  .reminder_days_before` (int[]). Rationale: avoid a near-empty table that
  duplicates per-item config.
- **Phase 4 — no `ReminderSchedule` table.** Reaffirms the above: the item's
  offsets *are* the schedule. We added only `reminder_dispatch` (rows
  actually sent/attempted). `reminder_dispatch` has no audit trigger — the
  brief explicitly allows hard-deleting dispatches and we recompute them on
  every item change. Full reasoning in `04-phase-4-explained.md` §1–2.
- **Phase 4 — reminder recipient = account owner email.** Per-member /
  per-channel routing (SMS/voice) is Phase 7–8; Phase 4 ships email only.

### Scaffold corrections (not deviations, but notable)

- **2026-05-16 — Pinned Next.js to 15, not 16.** `create-next-app@latest`
  installed Next 16.2.6 by default. The brief mandates Next 15, and the
  `@supabase/ssr` + shadcn/ui ecosystem is most stable there, so we
  `npm install next@^15.5.0 eslint-config-next@^15.5.0` → resolved to
  **15.5.18** with React 19.2.4. Removed the Next-16 `AGENTS.md` that
  create-next-app injected (its "this is not the Next.js you know" guidance is
  false for v15) and repurposed `CLAUDE.md` as the project guide.
- **2026-05-16 — ESLint flat config + `@eslint/eslintrc`.** The Next-16
  scaffold's `eslint.config.mjs` imported `eslint-config-next/core-web-vitals`
  (Next 16 style) which doesn't resolve against the pinned
  `eslint-config-next@15`. Rewrote the flat config to the Next-15 standard
  `FlatCompat().extends("next/core-web-vitals","next/typescript")` and added
  dev dep `@eslint/eslintrc` — this is exactly what `create-next-app@15` would
  have installed, so it's a toolchain correction, not a stack deviation.
- **2026-05-16 — Extra TS strict flags.** Added `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `forceConsistentCasingInFileNames` on top of
  `strict: true` to honor "TS strict everywhere". Next reformatted tsconfig
  and set `jsx: preserve` automatically (expected).

## Environment notes

- Dev machine: Windows 11, Node v22.19.0, npm 11.6.0, git 2.46.0.
- Repo initialized locally; no remote configured yet.
- `.claude/` holds Claude Code memory — do not delete or commit secrets into it.
