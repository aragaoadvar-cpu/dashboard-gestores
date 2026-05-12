-- 033_backfill_module_permissions_existing_users.sql
-- Libera Dashboard e Aliado Financeiro para usuários antigos já existentes em profiles.

INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
SELECT p.id, 'dashboard_ads', true, NULL
FROM public.profiles p
ON CONFLICT (user_id, module_key) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
SELECT p.id, 'aliado_financeiro', true, NULL
FROM public.profiles p
ON CONFLICT (user_id, module_key) DO NOTHING;
