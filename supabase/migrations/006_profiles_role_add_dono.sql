-- 006_profiles_role_add_dono.sql
-- Expands profile role set to: dono, admin, gestor.

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('dono', 'admin', 'gestor'));
