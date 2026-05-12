-- 034_add_is_active_to_profiles.sql
-- Adiciona flag de ativação de conta na tabela profiles.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.profiles
ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.profiles
ALTER COLUMN is_active SET NOT NULL;
