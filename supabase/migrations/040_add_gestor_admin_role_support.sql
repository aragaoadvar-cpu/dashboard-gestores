-- 040_add_gestor_admin_role_support.sql
-- Suporte inicial para a role gestor_admin sem alterar fluxos existentes.

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('dono', 'admin', 'gestor_admin', 'gestor', 'auxiliar'));

CREATE OR REPLACE FUNCTION public.is_operational_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = check_user_id
      AND p.role IN ('admin', 'gestor_admin')
  );
$$;
