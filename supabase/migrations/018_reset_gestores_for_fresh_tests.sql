-- 018_reset_gestores_for_fresh_tests.sql
-- ATENCAO: destrutivo e irreversivel.
-- Objetivo: remover todos os gestores existentes e todos os dados relacionados,
-- mantendo os usuarios admin/dono para reiniciar os testes de convite.

BEGIN;

-- 1) Snapshot dos gestores atuais para reutilizar em todos os deletes.
CREATE TEMP TABLE tmp_gestores_reset AS
SELECT id
FROM public.profiles
WHERE role = 'gestor';

-- 2) Remove vinculos e configuracoes administrativas relacionadas aos gestores.
DELETE FROM public.admin_gestor_taxas agt
USING tmp_gestores_reset g
WHERE agt.gestor_user_id = g.id;

DELETE FROM public.admin_gestores ag
USING tmp_gestores_reset g
WHERE ag.gestor_user_id = g.id;

-- 3) Remove convites de gestor para limpar o fluxo de testes.
DELETE FROM public.user_invitations
WHERE invite_type = 'gestor';

-- 4) Remove dados operacionais dos gestores.
DELETE FROM public.despesas d
USING tmp_gestores_reset g
WHERE d.user_id = g.id;

DELETE FROM public.lancamentos l
USING public.operacoes o, tmp_gestores_reset g
WHERE l.operacao_id = o.id
  AND o.user_id = g.id;

DELETE FROM public.operacoes o
USING tmp_gestores_reset g
WHERE o.user_id = g.id;

-- 5) Remove perfis e contas de autenticacao dos gestores.
DELETE FROM public.profiles p
USING tmp_gestores_reset g
WHERE p.id = g.id;

DELETE FROM auth.users u
USING tmp_gestores_reset g
WHERE u.id = g.id;

COMMIT;

-- Verificacao rapida pos-execucao:
-- SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;
-- SELECT count(*) AS gestores_vinculados FROM public.admin_gestores WHERE status = 'ativo';
-- SELECT count(*) AS convites_gestor FROM public.user_invitations WHERE invite_type = 'gestor';
