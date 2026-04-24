-- 022_auxiliar_vinculos_inactivation_policy.sql
-- Permite inativação segura de vínculo auxiliar pelo owner (admin|gestor) ou dono.

ALTER TABLE public.auxiliar_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxiliar_vinculos_update_inactivate_by_owner_or_dono ON public.auxiliar_vinculos;

CREATE POLICY auxiliar_vinculos_update_inactivate_by_owner_or_dono
ON public.auxiliar_vinculos
FOR UPDATE
TO authenticated
USING (
  status = 'ativo'
  AND (
    public.is_dono(auth.uid())
    OR owner_user_id = auth.uid()
  )
)
WITH CHECK (
  (
    public.is_dono(auth.uid())
    OR owner_user_id = auth.uid()
  )
  AND status IN ('ativo', 'inativo')
);
