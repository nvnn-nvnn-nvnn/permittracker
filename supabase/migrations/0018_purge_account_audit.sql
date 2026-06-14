-- 0018 — Account erasure: privileged purge of append-only audit rows.
--
-- GDPR/CCPA erasure must delete an account's audit_log rows, but audit_log is
-- append-only: a BEFORE UPDATE/DELETE trigger (permitkeep_audit_block, 0003)
-- raises for ALL roles, and UPDATE/DELETE are REVOKEd from PUBLIC. We keep that
-- guarantee intact for everyone EXCEPT one narrowly-scoped, deliberate path.
--
-- Design: the block trigger gains a single escape hatch — a transaction-local
-- GUC `permitkeep.allow_audit_purge`. It is OFF by default (so the log stays
-- immutable), and ONLY purge_account_audit() turns it on, right before deleting
-- one account's rows. Because set_config(..., true) is transaction-local, the
-- hatch closes automatically at COMMIT/ROLLBACK and can never leak across
-- pooled connections. UPDATE stays blocked unconditionally; only DELETE is
-- allowed under the flag.

CREATE OR REPLACE FUNCTION public.permitkeep_audit_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- The ONLY sanctioned mutation: an account-erasure DELETE that set the
  -- transaction-local flag immediately beforehand (see purge_account_audit).
  IF TG_OP = 'DELETE'
     AND current_setting('permitkeep.allow_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$;
--> statement-breakpoint
-- The one path allowed to erase audit history, scoped to a single account.
-- SECURITY DEFINER so it runs as the function owner (past the PUBLIC REVOKE);
-- the GUC gate is what authorizes the delete inside the trigger.
CREATE OR REPLACE FUNCTION public.purge_account_audit(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Open the escape hatch for THIS transaction only, then delete just this
  -- account's rows. The flag resets automatically when the tx ends.
  PERFORM set_config('permitkeep.allow_audit_purge', 'on', true);
  DELETE FROM public.audit_log WHERE account_id = p_account_id;
  PERFORM set_config('permitkeep.allow_audit_purge', 'off', true);
END;
$$;
