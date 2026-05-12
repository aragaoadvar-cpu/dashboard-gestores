-- 037_backfill_dashboard_access_for_operational_users.sql
-- Sincroniza o fluxo operacional antigo da Dashboard com os módulos da plataforma.
-- Garante dashboard_ads = true para usuários operacionais e atualiza o aceite
-- de convites antigos para criar/reativar essa permissão automaticamente.

CREATE OR REPLACE FUNCTION public.accept_invitation_by_token_hash(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.user_invitations%ROWTYPE;
  v_current_role text;
  v_owner_role text;
  v_has_active_gestor_link boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'not_authenticated',
      'message', 'Usuário não autenticado.'
    );
  END IF;

  IF coalesce(p_token_hash, '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_token',
      'message', 'Token inválido.'
    );
  END IF;

  SELECT *
  INTO v_invite
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_found',
      'message', 'Convite inválido.'
    );
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_pending',
      'message', 'Este convite já foi utilizado ou não está mais pendente.'
    );
  END IF;

  IF v_invite.revoked_at IS NOT NULL OR v_invite.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_revoked',
      'message', 'Este convite foi revogado.'
    );
  END IF;

  IF v_invite.normalized_email <> v_user_email THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'email_mismatch',
      'message', 'Este convite pertence a outro email.'
    );
  END IF;

  SELECT p.role
  INTO v_current_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_current_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'profile_not_found',
      'message', 'Perfil do usuário não encontrado.'
    );
  END IF;

  IF v_invite.invite_type = 'admin' THEN
    IF v_current_role = 'dono' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'role_conflict',
        'message', 'Usuário já possui papel superior ao convite.'
      );
    END IF;

    UPDATE public.profiles
    SET role = 'admin',
        updated_at = now()
    WHERE id = v_user_id;

  ELSIF v_invite.invite_type = 'gestor' THEN
    IF v_current_role IN ('dono', 'admin') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'role_conflict',
        'message', 'Não é permitido rebaixar automaticamente usuário dono/admin para gestor.'
      );
    END IF;

    IF v_invite.target_admin_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'invalid_invite_data',
        'message', 'Convite de gestor sem admin de destino.'
      );
    END IF;

    UPDATE public.profiles
    SET role = 'gestor',
        updated_at = now()
    WHERE id = v_user_id;

    INSERT INTO public.admin_gestores (id, admin_user_id, gestor_user_id, status)
    VALUES (gen_random_uuid(), v_invite.target_admin_user_id, v_user_id, 'ativo')
    ON CONFLICT (gestor_user_id)
    DO UPDATE SET
      admin_user_id = EXCLUDED.admin_user_id,
      status = 'ativo';

  ELSIF v_invite.invite_type = 'auxiliar' THEN
    IF v_current_role IN ('dono', 'admin') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'role_conflict',
        'message', 'Não é permitido rebaixar automaticamente usuário dono/admin para auxiliar.'
      );
    END IF;

    IF v_current_role = 'gestor' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.admin_gestores ag
        WHERE ag.gestor_user_id = v_user_id
          AND ag.status = 'ativo'
      )
      INTO v_has_active_gestor_link;

      IF v_has_active_gestor_link THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'role_conflict',
          'message', 'Não é permitido rebaixar automaticamente gestor com vínculo ativo para auxiliar.'
        );
      END IF;
    END IF;

    IF v_invite.target_admin_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'invalid_invite_data',
        'message', 'Convite de auxiliar sem usuário de escopo.'
      );
    END IF;

    SELECT p.role
    INTO v_owner_role
    FROM public.profiles p
    WHERE p.id = v_invite.target_admin_user_id;

    IF v_owner_role NOT IN ('admin', 'gestor') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'invalid_owner_role',
        'message', 'Convite de auxiliar aponta para um usuário sem papel válido (admin/gestor).'
      );
    END IF;

    UPDATE public.profiles
    SET role = 'auxiliar',
        updated_at = now()
    WHERE id = v_user_id;

    INSERT INTO public.auxiliar_vinculos (
      id,
      auxiliar_user_id,
      owner_user_id,
      owner_role,
      invited_by_user_id,
      status
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      v_invite.target_admin_user_id,
      v_owner_role,
      v_invite.invited_by_user_id,
      'ativo'
    )
    ON CONFLICT (auxiliar_user_id)
    DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      owner_role = EXCLUDED.owner_role,
      invited_by_user_id = EXCLUDED.invited_by_user_id,
      status = 'ativo',
      updated_at = now();
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_invite_type',
      'message', 'Tipo de convite inválido.'
    );
  END IF;

  IF v_invite.invite_type IN ('gestor', 'auxiliar') THEN
    INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
    VALUES (v_user_id, 'dashboard_ads', true, v_invite.invited_by_user_id)
    ON CONFLICT (user_id, module_key)
    DO UPDATE SET
      enabled = true,
      granted_by = COALESCE(EXCLUDED.granted_by, public.user_module_permissions.granted_by),
      updated_at = now();
  END IF;

  UPDATE public.user_invitations
  SET
    status = 'accepted',
    accepted_by_user_id = v_user_id,
    accepted_at = now()
  WHERE id = v_invite.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_already_used',
      'message', 'Este convite já foi utilizado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'accepted',
    'message', 'Convite aceito com sucesso.',
    'invite_type', v_invite.invite_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_by_token_hash(text) TO authenticated;

WITH operational_users AS (
  SELECT ag.gestor_user_id AS user_id
  FROM public.admin_gestores ag
  WHERE ag.status = 'ativo'

  UNION

  SELECT av.auxiliar_user_id AS user_id
  FROM public.auxiliar_vinculos av
  WHERE av.status = 'ativo'

  UNION

  SELECT ui.accepted_by_user_id AS user_id
  FROM public.user_invitations ui
  WHERE ui.invite_type IN ('gestor', 'auxiliar')
    AND ui.accepted_by_user_id IS NOT NULL
    AND ui.status IN ('accepted', 'active_linked')
)
INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
SELECT DISTINCT ou.user_id, 'dashboard_ads', true, NULL
FROM operational_users ou
WHERE ou.user_id IS NOT NULL
ON CONFLICT (user_id, module_key) DO NOTHING;
