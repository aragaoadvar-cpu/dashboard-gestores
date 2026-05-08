-- 026_auxiliar_comissao_despesas.sql
-- Relaciona despesas selecionadas à comissão de cada auxiliar.

CREATE TABLE IF NOT EXISTS public.auxiliar_comissao_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auxiliar_comissao_id uuid NOT NULL REFERENCES public.auxiliar_comissoes (id) ON DELETE CASCADE,
  despesa_id bigint NOT NULL REFERENCES public.despesas (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auxiliar_comissao_id, despesa_id)
);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissao_despesas_comissao_id
  ON public.auxiliar_comissao_despesas (auxiliar_comissao_id);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissao_despesas_despesa_id
  ON public.auxiliar_comissao_despesas (despesa_id);

ALTER TABLE public.auxiliar_comissao_despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxiliar_comissao_despesas_select_scope ON public.auxiliar_comissao_despesas;
DROP POLICY IF EXISTS auxiliar_comissao_despesas_insert_scope ON public.auxiliar_comissao_despesas;
DROP POLICY IF EXISTS auxiliar_comissao_despesas_delete_scope ON public.auxiliar_comissao_despesas;

CREATE POLICY auxiliar_comissao_despesas_select_scope
ON public.auxiliar_comissao_despesas
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);

CREATE POLICY auxiliar_comissao_despesas_insert_scope
ON public.auxiliar_comissao_despesas
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);

CREATE POLICY auxiliar_comissao_despesas_delete_scope
ON public.auxiliar_comissao_despesas
FOR DELETE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);
