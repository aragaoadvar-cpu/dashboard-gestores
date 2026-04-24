-- 013_add_repasse_percentual_admin_to_admin_gestor_taxas.sql
-- Adds admin-specific repasse override per gestor.
-- NULL means fallback to real gestor repasse.

ALTER TABLE public.admin_gestor_taxas
ADD COLUMN IF NOT EXISTS repasse_percentual_admin numeric(5,2);
