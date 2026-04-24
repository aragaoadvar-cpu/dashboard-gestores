-- 017_add_repasse_percentual_to_operacoes.sql
-- Makes repasse percentage configurable per operation owner.
-- Backfill keeps previous behavior:
-- - admin own operations start with 30%
-- - others start with 20%

ALTER TABLE public.operacoes
ADD COLUMN IF NOT EXISTS repasse_percentual numeric(5,2);

UPDATE public.operacoes o
SET repasse_percentual = CASE
  WHEN p.role = 'admin' THEN 30
  ELSE 20
END
FROM public.profiles p
WHERE o.repasse_percentual IS NULL
  AND o.user_id = p.id;

UPDATE public.operacoes
SET repasse_percentual = 20
WHERE repasse_percentual IS NULL;

ALTER TABLE public.operacoes
ALTER COLUMN repasse_percentual SET DEFAULT 20;
