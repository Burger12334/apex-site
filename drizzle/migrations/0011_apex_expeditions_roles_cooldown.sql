ALTER TABLE public.application_forms ADD COLUMN accept_role_id text NOT NULL DEFAULT '';
ALTER TABLE public.application_submissions ADD COLUMN decided_at timestamptz;
ALTER TABLE public.discord_settings ADD COLUMN reapply_cooldown_days integer NOT NULL DEFAULT 0, ADD COLUMN events_channel_id text NOT NULL DEFAULT '';
CREATE TABLE public.expeditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL,
 leader text NOT NULL DEFAULT '',
 max_spots integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expeditions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expeditions TO authenticated;
GRANT ALL ON public.expeditions TO service_role;
ALTER TABLE public.expeditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY expeditions_public ON public.expeditions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY expeditions_manage ON public.expeditions FOR ALL TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE TABLE public.expedition_signups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 expedition_id uuid NOT NULL REFERENCES public.expeditions(id) ON DELETE CASCADE,
 discord_id text NOT NULL,
 discord_username text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (expedition_id, discord_id)
);
REVOKE ALL ON public.expedition_signups FROM anon, authenticated;
GRANT ALL ON public.expedition_signups TO service_role;
ALTER TABLE public.expedition_signups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.hall_of_fame (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 discord_id text NOT NULL UNIQUE,
 username text NOT NULL,
 avatar_url text NOT NULL DEFAULT '',
 summits integer NOT NULL DEFAULT 0,
 note text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.hall_of_fame TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hall_of_fame TO authenticated;
GRANT ALL ON public.hall_of_fame TO service_role;
ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY hall_public ON public.hall_of_fame FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY hall_manage ON public.hall_of_fame FOR ALL TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
