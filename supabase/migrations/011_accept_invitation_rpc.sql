-- 011_accept_invitation_rpc.sql
-- Implements secure invitation acceptance via SECURITY DEFINER RPC.

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

  IF v_invite.expires_at <= now() THEN
    UPDATE public.user_invitations
    SET status = 'expired'
    WHERE id = v_invite.id
      AND status = 'pending';

    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_expired',
      'message', 'Este convite expirou.'
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
    SET role = 'admin'
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
    SET role = 'gestor'
    WHERE id = v_user_id;

    INSERT INTO public.admin_gestores (id, admin_user_id, gestor_user_id, status)
    VALUES (gen_random_uuid(), v_invite.target_admin_user_id, v_user_id, 'ativo')
    ON CONFLICT (gestor_user_id)
    DO UPDATE SET
      admin_user_id = EXCLUDED.admin_user_id,
      status = 'ativo';
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_invite_type',
      'message', 'Tipo de convite inválido.'
    );
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
