-- 027_auxiliar_comissao_despesas_extras.sql
-- Despesas extras específicas de cada comissão de auxiliar.

CREATE TABLE IF NOT EXISTS public.auxiliar_comissao_despesas_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auxiliar_comissao_id uuid NOT NULL REFERENCES public.auxiliar_comissoes (id) ON DELETE CASCADE,
  nome text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissao_despesas_extras_comissao_id
  ON public.auxiliar_comissao_despesas_extras (auxiliar_comissao_id);

ALTER TABLE public.auxiliar_comissao_despesas_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxiliar_comissao_despesas_extras_select_scope
  ON public.auxiliar_comissao_despesas_extras;
DROP POLICY IF EXISTS auxiliar_comissao_despesas_extras_insert_scope
  ON public.auxiliar_comissao_despesas_extras;
DROP POLICY IF EXISTS auxiliar_comissao_despesas_extras_update_scope
  ON public.auxiliar_comissao_despesas_extras;
DROP POLICY IF EXISTS auxiliar_comissao_despesas_extras_delete_scope
  ON public.auxiliar_comissao_despesas_extras;

CREATE POLICY auxiliar_comissao_despesas_extras_select_scope
ON public.auxiliar_comissao_despesas_extras
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas_extras.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);

CREATE POLICY auxiliar_comissao_despesas_extras_insert_scope
ON public.auxiliar_comissao_despesas_extras
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas_extras.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);

CREATE POLICY auxiliar_comissao_despesas_extras_update_scope
ON public.auxiliar_comissao_despesas_extras
FOR UPDATE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas_extras.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas_extras.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);

CREATE POLICY auxiliar_comissao_despesas_extras_delete_scope
ON public.auxiliar_comissao_despesas_extras
FOR DELETE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.auxiliar_comissoes ac
    WHERE ac.id = auxiliar_comissao_despesas_extras.auxiliar_comissao_id
      AND ac.convidador_user_id = auth.uid()
  )
);
