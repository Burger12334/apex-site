ALTER TABLE public.reports ADD COLUMN decision_reason text NOT NULL DEFAULT '';
ALTER TABLE public.application_submissions ADD COLUMN decision_reason text NOT NULL DEFAULT '', ADD COLUMN dm_status text NOT NULL DEFAULT '';
