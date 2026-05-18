-- PermitKeep — Phase 6: commissary audit trigger + RLS.
-- 'commissary' was added to the audit_entity enum in 0009 (separate
-- migration/transaction, so the value is usable here). Reuses the generic
-- Phase 2 audit function.
CREATE TRIGGER commissary_audit
  AFTER INSERT OR UPDATE ON public.commissary
  FOR EACH ROW
  EXECUTE FUNCTION public.permitkeep_audit('commissary');
--> statement-breakpoint
ALTER TABLE public.commissary ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY commissary_member_select ON public.commissary
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
