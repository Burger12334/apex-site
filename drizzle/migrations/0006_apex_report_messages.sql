CREATE TABLE public.report_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
 author_role text NOT NULL CHECK (author_role IN ('reporter','supervision')),
 author_discord_id text NOT NULL,
 author_username text NOT NULL,
 body text NOT NULL,
 dm_status text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_messages_report ON public.report_messages (report_id, created_at);
REVOKE ALL ON public.report_messages FROM anon, authenticated;
GRANT ALL ON public.report_messages TO service_role;
ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;
