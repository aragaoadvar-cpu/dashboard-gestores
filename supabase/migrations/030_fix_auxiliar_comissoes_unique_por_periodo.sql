-- 030_fix_auxiliar_comissoes_unique_por_periodo.sql
-- Remove a unicidade global antiga da comissão do auxiliar e mantém a unicidade por mês/ano.

ALTER TABLE public.auxiliar_comissoes
  DROP CONSTRAINT IF EXISTS auxiliar_comissoes_convidador_user_id_auxiliar_user_id_key;

DROP INDEX IF EXISTS public.auxiliar_comissoes_convidador_user_id_auxiliar_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_auxiliar_comissoes_convidador_auxiliar_periodo
  ON public.auxiliar_comissoes (convidador_user_id, auxiliar_user_id, mes, ano);
