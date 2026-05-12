-- 035_financeiro_recorrencia_parcelamento.sql
-- Adiciona suporte a despesa única, recorrente mensal e parcelada.

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS recorrencia_tipo text;

UPDATE public.financeiro_lancamentos
SET recorrencia_tipo = 'unica'
WHERE recorrencia_tipo IS NULL;

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN recorrencia_tipo SET DEFAULT 'unica';

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN recorrencia_tipo SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financeiro_lancamentos_recorrencia_tipo_check'
  ) THEN
    ALTER TABLE public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_recorrencia_tipo_check
    CHECK (recorrencia_tipo IN ('unica', 'recorrente', 'parcelada'));
  END IF;
END
$$;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS recorrencia_grupo_id uuid NULL;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS parcela_atual integer NULL;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS parcela_total integer NULL;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS recorrencia_ativa boolean;

UPDATE public.financeiro_lancamentos
SET recorrencia_ativa = false
WHERE recorrencia_ativa IS NULL;

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN recorrencia_ativa SET DEFAULT false;

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN recorrencia_ativa SET NOT NULL;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS recorrencia_dia integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financeiro_lancamentos_recorrencia_dia_check'
  ) THEN
    ALTER TABLE public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_recorrencia_dia_check
    CHECK (recorrencia_dia IS NULL OR recorrencia_dia BETWEEN 1 AND 31);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financeiro_lancamentos_parcela_check'
  ) THEN
    ALTER TABLE public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_parcela_check
    CHECK (
      (parcela_atual IS NULL AND parcela_total IS NULL)
      OR (
        parcela_atual IS NOT NULL
        AND parcela_total IS NOT NULL
        AND parcela_atual >= 1
        AND parcela_total >= 1
        AND parcela_atual <= parcela_total
      )
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_recorrencia_grupo
  ON public.financeiro_lancamentos (user_id, recorrencia_grupo_id);
