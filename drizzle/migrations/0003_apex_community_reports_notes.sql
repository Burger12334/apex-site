CREATE TABLE public.team_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 discord_id text NOT NULL UNIQUE,
 username text NOT NULL,
 avatar_url text NOT NULL DEFAULT '',
 title text NOT NULL DEFAULT 'Team member',
 sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.team_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_public ON public.team_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY team_manage ON public.team_members FOR ALL TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE TABLE public.supervision_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 discord_id text NOT NULL UNIQUE,
 username text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.supervision_members TO authenticated;
GRANT ALL ON public.supervision_members TO service_role;
ALTER TABLE public.supervision_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervision_editor_read ON public.supervision_members FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY supervision_editor_add ON public.supervision_members FOR INSERT TO authenticated WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE POLICY supervision_editor_remove ON public.supervision_members FOR DELETE TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE TABLE public.discord_settings (
 id text PRIMARY KEY DEFAULT 'main',
 guild_id text NOT NULL DEFAULT '',
 channel_id text NOT NULL DEFAULT '',
 ping_role_ids text[] NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE ON public.discord_settings TO authenticated;
GRANT ALL ON public.discord_settings TO service_role;
ALTER TABLE public.discord_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY discord_editor_read ON public.discord_settings FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY discord_editor_add ON public.discord_settings FOR INSERT TO authenticated WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE POLICY discord_editor_update ON public.discord_settings FOR UPDATE TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE TABLE public.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_discord_id text NOT NULL,
 reporter_username text NOT NULL,
 reported_name text NOT NULL,
 reported_discord_id text NOT NULL,
 reason text NOT NULL,
 proof_path text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by text NOT NULL DEFAULT '',
 notification_status text NOT NULL DEFAULT 'pending',
 notification_error text NOT NULL DEFAULT ''
);
GRANT SELECT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_editor_read ON public.reports FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY reports_editor_update ON public.reports FOR UPDATE TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE TABLE public.application_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.application_submissions(id) ON DELETE CASCADE,
 author_id uuid NOT NULL,
 author_email text NOT NULL,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.application_notes TO authenticated;
GRANT ALL ON public.application_notes TO service_role;
ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_editor_read ON public.application_notes FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY notes_editor_add ON public.application_notes FOR INSERT TO authenticated WITH CHECK (public.apex_role() IN ('owner','editor') AND author_id = auth.uid() AND lower(author_email) = lower(auth.jwt()->>'email'));
CREATE POLICY proof_editor_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'apex-report-proof' AND public.apex_role() IN ('owner','editor'));
