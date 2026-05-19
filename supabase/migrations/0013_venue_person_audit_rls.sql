-- PermitKeep — Phase 8: audit triggers + RLS for venue / person /
-- person_truck. Same model as every tenant table: member-scoped reads, all
-- writes via the server/service connection; venue & person get the shared
-- append-only audit trigger (person_truck is a hard-deletable join — no
-- audit, like reminder_dispatch).
CREATE TRIGGER venue_audit
  AFTER INSERT OR UPDATE ON public.venue
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('venue');
--> statement-breakpoint
CREATE TRIGGER person_audit
  AFTER INSERT OR UPDATE ON public.person
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('person');
--> statement-breakpoint
ALTER TABLE public.venue        ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.person       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.person_truck ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY venue_member_select ON public.venue
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY person_member_select ON public.person
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY person_truck_member_select ON public.person_truck
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
