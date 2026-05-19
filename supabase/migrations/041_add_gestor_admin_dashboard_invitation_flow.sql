-- 041_add_gestor_admin_dashboard_invitation_flow.sql
-- Adiciona suporte a convites operacionais de gestor_admin na Dashboard ADSYNC3.

ALTER TABLE public.user_invitations
DROP CONSTRAINT IF EXISTS user_invitations_invite_type_check;

ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_invite_type_check
CHECK (invite_type IN ('admin', 'gestor_admin', 'gestor', 'auxiliar'));

ALTER TABLE public.user_invitations
DROP CONSTRAINT IF EXISTS user_invitations_target_admin_by_type_check;

ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_target_admin_by_type_check
CHECK (
  (invite_type IN ('admin', 'gestor_admin') AND target_admin_user_id IS NULL)
  OR (invite_type IN ('gestor', 'auxiliar') AND target_admin_user_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.can_invite(inviter_id uuid, desired_invite_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN desired_invite_type = 'admin' THEN public.is_dono(inviter_id)
    WHEN desired_invite_type = 'gestor_admin' THEN public.is_dono(inviter_id)
    WHEN desired_invite_type = 'gestor' THEN public.is_operational_admin(inviter_id)
    WHEN desired_invite_type = 'auxiliar' THEN public.is_operational_admin(inviter_id) OR public.is_gestor(inviter_id)
    ELSE FALSE
  END;
$$;

DROP POLICY IF EXISTS user_invitations_select_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_gestor_own_auxiliar_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_scope_for_gestor_auxiliar ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_gestor_auxiliar_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_dono_admin_type_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_admin_own_scope_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_gestor_own_auxiliar_scope_pending ON public.user_invitations;

CREATE POLICY user_invitations_select_dono_admin_type
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type IN ('admin', 'gestor_admin')
  AND public.is_dono(auth.uid())
);

CREATE POLICY user_invitations_select_admin_own_scope
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type IN ('gestor', 'auxiliar')
  AND public.is_operational_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

CREATE POLICY user_invitations_select_gestor_own_auxiliar_scope
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type = 'auxiliar'
  AND public.is_gestor(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

CREATE POLICY user_invitations_insert_dono_admin_type
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type IN ('admin', 'gestor_admin')
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
  AND public.can_invite(auth.uid(), invite_type)
);

CREATE POLICY user_invitations_insert_admin_scope_for_gestor_auxiliar
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type IN ('gestor', 'auxiliar')
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
  AND public.is_operational_admin(auth.uid())
  AND public.can_invite(auth.uid(), invite_type)
);

CREATE POLICY user_invitations_insert_gestor_auxiliar_type
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type = 'auxiliar'
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
  AND public.is_gestor(auth.uid())
  AND public.can_invite(auth.uid(), invite_type)
);

CREATE POLICY user_invitations_update_dono_admin_type_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type IN ('admin', 'gestor_admin')
  AND public.is_dono(auth.uid())
  AND status = 'pending'
)
WITH CHECK (
  invite_type IN ('admin', 'gestor_admin')
  AND public.is_dono(auth.uid())
);

CREATE POLICY user_invitations_update_admin_own_scope_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type IN ('gestor', 'auxiliar')
  AND public.is_operational_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  invite_type IN ('gestor', 'auxiliar')
  AND public.is_operational_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

CREATE POLICY user_invitations_update_gestor_own_auxiliar_scope_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type = 'auxiliar'
  AND public.is_gestor(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  invite_type = 'auxiliar'
  AND public.is_gestor(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

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
  v_has_active_auxiliar_link boolean := false;
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

  ELSIF v_invite.invite_type = 'gestor_admin' THEN
    IF v_current_role IN ('dono', 'admin') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'role_conflict',
        'message', 'Não é permitido rebaixar automaticamente usuário dono/admin para gestor_admin.'
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
          'message', 'Não é permitido promover automaticamente gestor com vínculo ativo para gestor_admin.'
        );
      END IF;
    END IF;

    IF v_current_role = 'auxiliar' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.auxiliar_vinculos av
        WHERE av.auxiliar_user_id = v_user_id
          AND av.status = 'ativo'
      )
      INTO v_has_active_auxiliar_link;

      IF v_has_active_auxiliar_link THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'role_conflict',
          'message', 'Não é permitido promover automaticamente auxiliar com vínculo ativo para gestor_admin.'
        );
      END IF;
    END IF;

    UPDATE public.profiles
    SET role = 'gestor_admin',
        updated_at = now()
    WHERE id = v_user_id;

  ELSIF v_invite.invite_type = 'gestor' THEN
    IF v_current_role IN ('dono', 'admin', 'gestor_admin') THEN
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
    IF v_current_role IN ('dono', 'admin', 'gestor_admin') THEN
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

    IF v_owner_role NOT IN ('admin', 'gestor_admin', 'gestor') THEN
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
      CASE WHEN v_owner_role = 'gestor' THEN 'gestor' ELSE 'admin' END,
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
