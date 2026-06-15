-- VendGuard — Events: append-only audit trigger + RLS for the event table.
-- Same model as every tenant table: member-scoped reads, all writes via the
-- server/service connection; event gets the shared append-only audit trigger.
CREATE TRIGGER event_audit
  AFTER INSERT OR UPDATE ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('event');
--> statement-breakpoint
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY event_member_select ON public.event
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
