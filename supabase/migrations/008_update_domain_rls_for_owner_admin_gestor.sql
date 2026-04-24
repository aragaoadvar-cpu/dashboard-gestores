-- 008_update_domain_rls_for_owner_admin_gestor.sql
-- RLS behavior:
-- - gestor: reads only own data
-- - admin: reads own data + linked gestores
-- - dono: global read
-- - writes remain ownership-only

-- ============================================================================
-- 1) OPERACOES
-- ============================================================================
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operacoes_select_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_select_owner_or_admin ON public.operacoes;
DROP POLICY IF EXISTS operacoes_select_by_network_role ON public.operacoes;
DROP POLICY IF EXISTS operacoes_insert_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_update_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_delete_own ON public.operacoes;

CREATE POLICY operacoes_select_by_network_role
ON public.operacoes
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
);

CREATE POLICY operacoes_insert_own
ON public.operacoes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY operacoes_update_own
ON public.operacoes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY operacoes_delete_own
ON public.operacoes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 2) DESPESAS
-- ============================================================================
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS despesas_select_own ON public.despesas;
DROP POLICY IF EXISTS despesas_select_owner_or_admin ON public.despesas;
DROP POLICY IF EXISTS despesas_select_by_network_role ON public.despesas;
DROP POLICY IF EXISTS despesas_insert_own ON public.despesas;
DROP POLICY IF EXISTS despesas_update_own ON public.despesas;
DROP POLICY IF EXISTS despesas_delete_own ON public.despesas;

CREATE POLICY despesas_select_by_network_role
ON public.despesas
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
);

CREATE POLICY despesas_insert_own
ON public.despesas
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY despesas_update_own
ON public.despesas
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY despesas_delete_own
ON public.despesas
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 3) LANCAMENTOS
-- Ownership derives from operacoes.user_id
-- ============================================================================
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lancamentos_select_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_select_owner_or_admin ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_select_by_network_role ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_insert_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_update_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_delete_by_operacao_owner ON public.lancamentos;

CREATE POLICY lancamentos_select_by_network_role
ON public.lancamentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        public.is_dono(auth.uid())
        OR o.user_id = auth.uid()
        OR (
          public.is_admin(auth.uid())
          AND public.is_admin_of_gestor(auth.uid(), o.user_id)
        )
      )
  )
);

CREATE POLICY lancamentos_insert_by_operacao_owner
ON public.lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY lancamentos_update_by_operacao_owner
ON public.lancamentos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND o.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY lancamentos_delete_by_operacao_owner
ON public.lancamentos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND o.user_id = auth.uid()
  )
);
