-- 029_auxiliar_comissao_por_periodo.sql
-- Torna a configuração da comissão do auxiliar mensal, separando por mês/ano.

ALTER TABLE public.auxiliar_comissoes
  ADD COLUMN IF NOT EXISTS mes integer,
  ADD COLUMN IF NOT EXISTS ano integer;

ALTER TABLE public.auxiliar_comissao_despesas_extras
  ADD COLUMN IF NOT EXISTS mes integer,
  ADD COLUMN IF NOT EXISTS ano integer;

UPDATE public.auxiliar_comissoes
SET
  mes = COALESCE(mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer),
  ano = COALESCE(ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer)
WHERE mes IS NULL OR ano IS NULL;

UPDATE public.auxiliar_comissao_despesas_extras ace
SET
  mes = ac.mes,
  ano = ac.ano
FROM public.auxiliar_comissoes ac
WHERE ac.id = ace.auxiliar_comissao_id
  AND (ace.mes IS NULL OR ace.ano IS NULL);

WITH comissoes_duplicadas AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY convidador_user_id, auxiliar_user_id, mes, ano
      ORDER BY ativo DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS posicao
  FROM public.auxiliar_comissoes
)
DELETE FROM public.auxiliar_comissoes ac
USING comissoes_duplicadas cd
WHERE ac.id = cd.id
  AND cd.posicao > 1;

ALTER TABLE public.auxiliar_comissoes
  ALTER COLUMN mes SET NOT NULL,
  ALTER COLUMN ano SET NOT NULL;

ALTER TABLE public.auxiliar_comissao_despesas_extras
  ALTER COLUMN mes SET NOT NULL,
  ALTER COLUMN ano SET NOT NULL;

ALTER TABLE public.auxiliar_comissoes
  ADD CONSTRAINT auxiliar_comissoes_mes_check CHECK (mes BETWEEN 1 AND 12),
  ADD CONSTRAINT auxiliar_comissoes_ano_check CHECK (ano >= 2000);

ALTER TABLE public.auxiliar_comissao_despesas_extras
  ADD CONSTRAINT auxiliar_comissao_despesas_extras_mes_check CHECK (mes BETWEEN 1 AND 12),
  ADD CONSTRAINT auxiliar_comissao_despesas_extras_ano_check CHECK (ano >= 2000);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auxiliar_comissoes_convidador_auxiliar_periodo
  ON public.auxiliar_comissoes (convidador_user_id, auxiliar_user_id, mes, ano);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissoes_auxiliar_periodo
  ON public.auxiliar_comissoes (auxiliar_user_id, mes, ano);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissoes_convidador_periodo
  ON public.auxiliar_comissoes (convidador_user_id, mes, ano);

CREATE INDEX IF NOT EXISTS idx_auxiliar_comissao_despesas_extras_periodo
  ON public.auxiliar_comissao_despesas_extras (auxiliar_comissao_id, mes, ano);
