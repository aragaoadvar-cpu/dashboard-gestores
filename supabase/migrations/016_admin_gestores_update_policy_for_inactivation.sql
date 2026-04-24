-- 016_admin_gestores_update_policy_for_inactivation.sql
-- Allows admin/dono to inactivate gestor links without service role.

ALTER TABLE public.admin_gestores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gestores_update_inactivate_by_owner_or_dono ON public.admin_gestores;

CREATE POLICY admin_gestores_update_inactivate_by_owner_or_dono
ON public.admin_gestores
FOR UPDATE
TO authenticated
USING (
  (
    public.is_dono(auth.uid())
    AND status = 'ativo'
  )
  OR (
    public.is_admin(auth.uid())
    AND admin_user_id = auth.uid()
    AND status = 'ativo'
  )
)
WITH CHECK (
  (
    public.is_dono(auth.uid())
    AND status IN ('ativo', 'inativo')
  )
  OR (
    public.is_admin(auth.uid())
    AND admin_user_id = auth.uid()
    AND status IN ('ativo', 'inativo')
  )
);
