-- Restores the original rule: only emails listed in public.user_roles have access.
CREATE OR REPLACE FUNCTION public.apex_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT role FROM public.user_roles WHERE lower(email) = lower(auth.jwt()->>'email') AND auth.jwt()->>'email_verified' IS DISTINCT FROM 'false' LIMIT 1 $$;
