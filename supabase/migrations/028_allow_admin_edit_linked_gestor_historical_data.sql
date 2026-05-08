-- 028_allow_admin_edit_linked_gestor_historical_data.sql
-- Permite que admin gerencie operacoes, lancamentos e despesas
-- de gestores vinculados ativamente, inclusive em meses passados.

ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operacoes_insert_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_update_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_delete_own ON public.operacoes;

CREATE POLICY operacoes_insert_own
ON public.operacoes
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY operacoes_update_own
ON public.operacoes
FOR UPDATE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
)
WITH CHECK (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
);

CREATE POLICY operacoes_delete_own
ON public.operacoes
FOR DELETE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS despesas_insert_own ON public.despesas;
DROP POLICY IF EXISTS despesas_update_own ON public.despesas;
DROP POLICY IF EXISTS despesas_delete_own ON public.despesas;

CREATE POLICY despesas_insert_own
ON public.despesas
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY despesas_update_own
ON public.despesas
FOR UPDATE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
)
WITH CHECK (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY despesas_delete_own
ON public.despesas
FOR DELETE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

DROP POLICY IF EXISTS lancamentos_insert_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_update_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_delete_by_operacao_owner ON public.lancamentos;

CREATE POLICY lancamentos_insert_by_operacao_owner
ON public.lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
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
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
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
      AND (
        public.is_dono(auth.uid())
        OR o.user_id = auth.uid()
        OR (
          public.is_admin(auth.uid())
          AND public.is_admin_of_gestor(auth.uid(), o.user_id)
        )
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
)
WITH CHECK (
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
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
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
      AND (
        public.is_dono(auth.uid())
        OR o.user_id = auth.uid()
        OR (
          public.is_admin(auth.uid())
          AND public.is_admin_of_gestor(auth.uid(), o.user_id)
        )
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
);
