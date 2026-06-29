-- CartLedger — Square OAuth tokens. RLS enabled with NO policies, so the
-- anon/authenticated roles can read nothing here; only the service connection
-- (the server) ever touches encrypted tokens. Tokens are AES-encrypted at rest.
ALTER TABLE public.square_oauth ENABLE ROW LEVEL SECURITY;
