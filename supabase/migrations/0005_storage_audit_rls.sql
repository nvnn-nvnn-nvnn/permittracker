-- PermitKeep — Phase 3: documents bucket, file audit trigger, RLS.

-- Private Storage bucket for uploaded documents. Private = no public URLs;
-- the app issues short-lived SIGNED urls (server, service role) for both
-- upload and download. We deliberately add NO permissive storage.objects
-- policies: with RLS on and no policy, anon/authenticated keys are denied,
-- and the service role (used only server-side) bypasses RLS. Smallest,
-- safest surface given we never touch storage from the browser directly
-- except via a signed URL.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
--> statement-breakpoint
-- Reuse the Phase 2 audit function for file_attachment (arg = entity label).
-- 'file_attachment' was added to the audit_entity enum in 0004 (separate
-- migration/transaction, so the new enum value is usable here).
CREATE TRIGGER file_attachment_audit
  AFTER INSERT OR UPDATE ON public.file_attachment
  FOR EACH ROW
  EXECUTE FUNCTION public.permitkeep_audit('file_attachment');
--> statement-breakpoint
-- RLS for the new tables (same model as Phases 1–2: member-scoped reads,
-- all writes via the server/service connection through tRPC).
ALTER TABLE public.file_attachment     ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.extraction_proposal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.extraction_cost     ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY file_attachment_member_select ON public.file_attachment
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY extraction_proposal_member_select ON public.extraction_proposal
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY extraction_cost_member_select ON public.extraction_cost
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
