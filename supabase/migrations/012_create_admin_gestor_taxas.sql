-- 012_create_admin_gestor_taxas.sql
-- Admin-defined tax overrides per gestor.
-- Null values mean "use real gestor operation rates" as fallback in app logic.

CREATE TABLE IF NOT EXISTS public.admin_gestor_taxas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gestor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  taxa_facebook_admin numeric(10,2),
  taxa_network_admin numeric(10,2),
  taxa_imposto_admin numeric(10,2),
  cotacao_dolar_admin numeric(10,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, gestor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_gestor_taxas_admin_user_id
  ON public.admin_gestor_taxas (admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_gestor_taxas_gestor_user_id
  ON public.admin_gestor_taxas (gestor_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_gestor_taxas_admin_gestor
  ON public.admin_gestor_taxas (admin_user_id, gestor_user_id);

ALTER TABLE public.admin_gestor_taxas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gestor_taxas_select_admin_own_active_gestores ON public.admin_gestor_taxas;
DROP POLICY IF EXISTS admin_gestor_taxas_select_dono_global_read ON public.admin_gestor_taxas;
DROP POLICY IF EXISTS admin_gestor_taxas_insert_admin_own_active_gestores ON public.admin_gestor_taxas;
DROP POLICY IF EXISTS admin_gestor_taxas_update_admin_own_active_gestores ON public.admin_gestor_taxas;
DROP POLICY IF EXISTS admin_gestor_taxas_delete_admin_own_active_gestores ON public.admin_gestor_taxas;

-- DONO: global read-only visibility.
CREATE POLICY admin_gestor_taxas_select_dono_global_read
ON public.admin_gestor_taxas
FOR SELECT
TO authenticated
USING (public.is_dono(auth.uid()));

-- ADMIN: can read only own admin->gestor pairs with active link.
CREATE POLICY admin_gestor_taxas_select_admin_own_active_gestores
ON public.admin_gestor_taxas
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND admin_user_id = auth.uid()
  AND public.is_admin_of_gestor(auth.uid(), gestor_user_id)
);

-- ADMIN: can create only own admin->gestor pairs with active link.
CREATE POLICY admin_gestor_taxas_insert_admin_own_active_gestores
ON public.admin_gestor_taxas
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  AND admin_user_id = auth.uid()
  AND public.is_admin_of_gestor(auth.uid(), gestor_user_id)
);

-- ADMIN: can update only own admin->gestor pairs with active link.
CREATE POLICY admin_gestor_taxas_update_admin_own_active_gestores
ON public.admin_gestor_taxas
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND admin_user_id = auth.uid()
  AND public.is_admin_of_gestor(auth.uid(), gestor_user_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND admin_user_id = auth.uid()
  AND public.is_admin_of_gestor(auth.uid(), gestor_user_id)
);

-- ADMIN: can delete only own admin->gestor pairs with active link.
CREATE POLICY admin_gestor_taxas_delete_admin_own_active_gestores
ON public.admin_gestor_taxas
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND admin_user_id = auth.uid()
  AND public.is_admin_of_gestor(auth.uid(), gestor_user_id)
);
