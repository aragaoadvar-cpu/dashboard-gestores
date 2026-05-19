-- 039_add_accepted_by_user_to_platform_invitations.sql
-- Rastreia qual usuário real aceitou o convite da plataforma.

ALTER TABLE public.platform_user_invitations
ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid NULL
REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_platform_user_invitations_invited_by_status_accepted_by
  ON public.platform_user_invitations (invited_by, status, accepted_by_user_id);

CREATE OR REPLACE FUNCTION public.accept_platform_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.platform_user_invitations%ROWTYPE;
  v_current_role text;
  v_module text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'not_authenticated',
      'message', 'Usuário não autenticado.'
    );
  END IF;

  IF coalesce(trim(p_token), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_token',
      'message', 'Token inválido.'
    );
  END IF;

  SELECT *
  INTO v_invite
  FROM public.platform_user_invitations
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_found',
      'message', 'Convite da plataforma não encontrado.'
    );
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_pending',
      'message', 'Este convite da plataforma não está mais pendente.'
    );
  END IF;

  IF lower(trim(v_invite.email)) <> v_user_email THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'email_mismatch',
      'message', 'Este convite pertence a outro email.'
    );
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (v_user_id, 'gestor')
  ON CONFLICT (id) DO NOTHING;

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

  IF v_current_role NOT IN ('dono', 'admin') THEN
    UPDATE public.profiles
    SET role = 'gestor'
    WHERE id = v_user_id;
  END IF;

  FOREACH v_module IN ARRAY v_invite.modules LOOP
    IF v_module NOT IN (
      'dashboard_ads',
      'aliado_financeiro',
      'aliado_financeiro_pessoal',
      'aliado_financeiro_empresarial'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'invalid_module',
        'message', 'Convite contém módulo inválido.'
      );
    END IF;

    IF v_module = 'aliado_financeiro' THEN
      INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
      VALUES
        (v_user_id, 'aliado_financeiro_pessoal', true, v_invite.invited_by),
        (v_user_id, 'aliado_financeiro_empresarial', true, v_invite.invited_by)
      ON CONFLICT (user_id, module_key)
      DO UPDATE SET
        enabled = true,
        granted_by = COALESCE(EXCLUDED.granted_by, public.user_module_permissions.granted_by),
        updated_at = now();
    ELSE
      INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
      VALUES (v_user_id, v_module, true, v_invite.invited_by)
      ON CONFLICT (user_id, module_key)
      DO UPDATE SET
        enabled = true,
        granted_by = COALESCE(EXCLUDED.granted_by, public.user_module_permissions.granted_by),
        updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.platform_user_invitations
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by_user_id = v_user_id
  WHERE id = v_invite.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'code', 'accepted',
    'message', 'Convite da plataforma aceito com sucesso.',
    'modules', v_invite.modules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_platform_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_platform_invitation(text) TO authenticated;
