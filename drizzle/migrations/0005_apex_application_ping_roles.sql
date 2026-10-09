ALTER TABLE public.application_forms ADD COLUMN ping_role_ids text[] NOT NULL DEFAULT '{}';
