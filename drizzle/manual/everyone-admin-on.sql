-- TEMPORARY: every signed-in account becomes an owner.
-- This changes the shared database, so it applies to the live site as well as localhost:
-- anyone who creates an account can edit the site and read private reports and applications.
-- Undo with everyone-admin-off.sql. Not part of the migration journal; run it by hand.
CREATE OR REPLACE FUNCTION public.apex_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT CASE WHEN auth.uid() IS NOT NULL THEN 'owner' END $$;
