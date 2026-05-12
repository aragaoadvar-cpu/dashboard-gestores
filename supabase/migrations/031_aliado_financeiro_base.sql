-- 031_aliado_financeiro_base.sql
-- Base do módulo Aliado Financeiro com isolamento por usuário.

CREATE TABLE IF NOT EXISTS public.financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  cor text NULL,
  icone text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo, nome)
);

CREATE TABLE IF NOT EXISTS public.financeiro_subcategorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.financeiro_categorias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (categoria_id, nome)
);

CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor >= 0),
  data date NOT NULL,
  categoria_id uuid NULL REFERENCES public.financeiro_categorias(id) ON DELETE SET NULL,
  subcategoria_id uuid NULL REFERENCES public.financeiro_subcategorias(id) ON DELETE SET NULL,
  forma_pagamento text NULL,
  observacao text NULL,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_lancamentos_origem_check
    CHECK (origem IN ('manual', 'whatsapp', 'importacao'))
);

CREATE TABLE IF NOT EXISTS public.financeiro_metas_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.financeiro_categorias(id) ON DELETE CASCADE,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano integer NOT NULL CHECK (ano >= 2000),
  limite_valor numeric(12,2) NOT NULL CHECK (limite_valor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, categoria_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_financeiro_categorias_user_tipo
  ON public.financeiro_categorias (user_id, tipo);

CREATE INDEX IF NOT EXISTS idx_financeiro_subcategorias_user_categoria
  ON public.financeiro_subcategorias (user_id, categoria_id);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_user_data
  ON public.financeiro_lancamentos (user_id, data);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_user_tipo_data
  ON public.financeiro_lancamentos (user_id, tipo, data);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_categoria
  ON public.financeiro_lancamentos (categoria_id, subcategoria_id);

CREATE INDEX IF NOT EXISTS idx_financeiro_metas_categoria_user_periodo
  ON public.financeiro_metas_categoria (user_id, mes, ano);

CREATE OR REPLACE FUNCTION public.financeiro_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financeiro_lancamentos_updated_at ON public.financeiro_lancamentos;
CREATE TRIGGER trg_financeiro_lancamentos_updated_at
BEFORE UPDATE ON public.financeiro_lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.financeiro_set_updated_at();

ALTER TABLE public.financeiro_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_metas_categoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_categorias_select_own ON public.financeiro_categorias;
DROP POLICY IF EXISTS financeiro_categorias_insert_own ON public.financeiro_categorias;
DROP POLICY IF EXISTS financeiro_categorias_update_own ON public.financeiro_categorias;
DROP POLICY IF EXISTS financeiro_categorias_delete_own ON public.financeiro_categorias;

CREATE POLICY financeiro_categorias_select_own
ON public.financeiro_categorias
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY financeiro_categorias_insert_own
ON public.financeiro_categorias
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY financeiro_categorias_update_own
ON public.financeiro_categorias
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY financeiro_categorias_delete_own
ON public.financeiro_categorias
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS financeiro_subcategorias_select_own ON public.financeiro_subcategorias;
DROP POLICY IF EXISTS financeiro_subcategorias_insert_own ON public.financeiro_subcategorias;
DROP POLICY IF EXISTS financeiro_subcategorias_update_own ON public.financeiro_subcategorias;
DROP POLICY IF EXISTS financeiro_subcategorias_delete_own ON public.financeiro_subcategorias;

CREATE POLICY financeiro_subcategorias_select_own
ON public.financeiro_subcategorias
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY financeiro_subcategorias_insert_own
ON public.financeiro_subcategorias
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  )
);

CREATE POLICY financeiro_subcategorias_update_own
ON public.financeiro_subcategorias
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  )
);

CREATE POLICY financeiro_subcategorias_delete_own
ON public.financeiro_subcategorias
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS financeiro_lancamentos_select_own ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_insert_own ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_update_own ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_delete_own ON public.financeiro_lancamentos;

CREATE POLICY financeiro_lancamentos_select_own
ON public.financeiro_lancamentos
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY financeiro_lancamentos_insert_own
ON public.financeiro_lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = auth.uid()
  ))
);

CREATE POLICY financeiro_lancamentos_update_own
ON public.financeiro_lancamentos
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = auth.uid()
  ))
);

CREATE POLICY financeiro_lancamentos_delete_own
ON public.financeiro_lancamentos
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS financeiro_metas_categoria_select_own ON public.financeiro_metas_categoria;
DROP POLICY IF EXISTS financeiro_metas_categoria_insert_own ON public.financeiro_metas_categoria;
DROP POLICY IF EXISTS financeiro_metas_categoria_update_own ON public.financeiro_metas_categoria;
DROP POLICY IF EXISTS financeiro_metas_categoria_delete_own ON public.financeiro_metas_categoria;

CREATE POLICY financeiro_metas_categoria_select_own
ON public.financeiro_metas_categoria
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY financeiro_metas_categoria_insert_own
ON public.financeiro_metas_categoria
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  )
);

CREATE POLICY financeiro_metas_categoria_update_own
ON public.financeiro_metas_categoria
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = auth.uid()
  )
);

CREATE POLICY financeiro_metas_categoria_delete_own
ON public.financeiro_metas_categoria
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
