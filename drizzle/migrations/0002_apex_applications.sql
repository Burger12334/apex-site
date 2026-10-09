CREATE TABLE public.application_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_open boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.application_forms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_forms TO authenticated;
GRANT ALL ON public.application_forms TO service_role;
ALTER TABLE public.application_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY forms_public ON public.application_forms FOR SELECT TO anon, authenticated USING (is_open);
CREATE POLICY forms_editor_read ON public.application_forms FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY forms_add ON public.application_forms FOR INSERT TO authenticated WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE POLICY forms_edit ON public.application_forms FOR UPDATE TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE POLICY forms_remove ON public.application_forms FOR DELETE TO authenticated USING (public.apex_role() IN ('owner','editor'));

CREATE TABLE public.application_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.application_forms(id) ON DELETE CASCADE,
  discord_id text NOT NULL,
  discord_username text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.application_submissions TO authenticated;
GRANT ALL ON public.application_submissions TO service_role;
ALTER TABLE public.application_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subs_editor_read ON public.application_submissions FOR SELECT TO authenticated USING (public.apex_role() IN ('owner','editor'));
CREATE POLICY subs_editor_edit ON public.application_submissions FOR UPDATE TO authenticated USING (public.apex_role() IN ('owner','editor')) WITH CHECK (public.apex_role() IN ('owner','editor'));
CREATE POLICY subs_editor_remove ON public.application_submissions FOR DELETE TO authenticated USING (public.apex_role() IN ('owner','editor'));