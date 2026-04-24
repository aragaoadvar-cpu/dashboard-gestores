-- 024_add_ecpm_to_lancamentos.sql
-- Campo manual de monitoramento diário (sem impacto em cálculos financeiros).

ALTER TABLE public.lancamentos
ADD COLUMN IF NOT EXISTS ecpm numeric(10,2) NULL;
