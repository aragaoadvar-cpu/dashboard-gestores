-- 007_admin_gestores_and_role_helpers.sql
-- Creates admin->gestor relation and role helper functions.

CREATE TABLE IF NOT EXISTS public.admin_gestores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gestor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gestor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_gestores_admin_user_id
  ON public.admin_gestores (admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_gestores_gestor_user_id
  ON public.admin_gestores (gestor_user_id);

ALTER TABLE public.admin_gestores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gestores_select_self_or_dono ON public.admin_gestores;
DROP POLICY IF EXISTS admin_gestores_insert_dono_only ON public.admin_gestores;
DROP POLICY IF EXISTS admin_gestores_update_dono_only ON public.admin_gestores;
DROP POLICY IF EXISTS admin_gestores_delete_dono_only ON public.admin_gestores;

CREATE OR REPLACE FUNCTION public.is_dono(check_user_id uuid DEFAULT auth.uid())
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
      AND p.role = 'dono'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid DEFAULT auth.uid())
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
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gestor(check_user_id uuid DEFAULT auth.uid())
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
      AND p.role = 'gestor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of_gestor(check_admin_id uuid, check_gestor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_gestores ag
    WHERE ag.admin_user_id = check_admin_id
      AND ag.gestor_user_id = check_gestor_id
      AND ag.status = 'ativo'
  );
$$;

CREATE POLICY admin_gestores_select_self_or_dono
ON public.admin_gestores
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR admin_user_id = auth.uid()
  OR gestor_user_id = auth.uid()
);

-- Relationship writes are intentionally restricted for now.
-- Use privileged/admin workflows for inserts/updates/deletes.
