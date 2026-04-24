-- 021_add_auxiliar_role_scope_and_invitation_flow.sql
-- Adiciona papel auxiliar com vínculo explícito ao convidador (admin|gestor),
-- amplia convites e ajusta RLS para escopo herdado.

-- ============================================================================
-- 1) ROLE auxiliar em profiles
-- ============================================================================
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('dono', 'admin', 'gestor', 'auxiliar'));

-- ============================================================================
-- 2) VÍNCULO auxiliar -> owner (admin|gestor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.auxiliar_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auxiliar_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  owner_role text NOT NULL CHECK (owner_role IN ('admin', 'gestor')),
  invited_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auxiliar_vinculos_owner_user_id
  ON public.auxiliar_vinculos (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_auxiliar_vinculos_status
  ON public.auxiliar_vinculos (status);

ALTER TABLE public.auxiliar_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxiliar_vinculos_select_self_owner_or_dono ON public.auxiliar_vinculos;

CREATE POLICY auxiliar_vinculos_select_self_owner_or_dono
ON public.auxiliar_vinculos
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR auxiliar_user_id = auth.uid()
  OR owner_user_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.is_auxiliar(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = check_user_id
      AND p.role = 'auxiliar'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auxiliar_owner_id(check_auxiliar_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT av.owner_user_id
  FROM public.auxiliar_vinculos av
  WHERE av.auxiliar_user_id = check_auxiliar_id
    AND av.status = 'ativo'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_auxiliar(check_owner_id uuid, check_auxiliar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.auxiliar_vinculos av
    WHERE av.owner_user_id = check_owner_id
      AND av.auxiliar_user_id = check_auxiliar_id
      AND av.status = 'ativo'
  );
$$;

-- ============================================================================
-- 3) CONVITES: suporte a invite_type = auxiliar
-- Reaproveita target_admin_user_id como "owner_id" para gestor/auxiliar.
-- ============================================================================
ALTER TABLE public.user_invitations
DROP CONSTRAINT IF EXISTS user_invitations_invite_type_check;

ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_invite_type_check
CHECK (invite_type IN ('admin', 'gestor', 'auxiliar'));

ALTER TABLE public.user_invitations
DROP CONSTRAINT IF EXISTS user_invitations_target_admin_by_type_check;

ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_target_admin_by_type_check
CHECK (
  (invite_type = 'admin' AND target_admin_user_id IS NULL)
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
    WHEN desired_invite_type = 'gestor' THEN public.is_admin(inviter_id)
    WHEN desired_invite_type = 'auxiliar' THEN public.is_admin(inviter_id) OR public.is_gestor(inviter_id)
    ELSE FALSE
  END;
$$;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_select_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_gestor_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_gestor_own_auxiliar_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_invited_user ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_gestor_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_scope_for_gestor_auxiliar ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_gestor_auxiliar_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_dono_admin_type_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_admin_own_gestor_type_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_admin_own_scope_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_gestor_own_auxiliar_scope_pending ON public.user_invitations;

CREATE POLICY user_invitations_select_dono_admin_type
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type = 'admin'
  AND public.is_dono(auth.uid())
);

CREATE POLICY user_invitations_select_admin_own_scope
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type IN ('gestor', 'auxiliar')
  AND public.is_admin(auth.uid())
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

CREATE POLICY user_invitations_select_invited_user
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  normalized_email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

CREATE POLICY user_invitations_insert_dono_admin_type
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type = 'admin'
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
  AND public.is_admin(auth.uid())
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
  invite_type = 'admin'
  AND status = 'pending'
  AND public.is_dono(auth.uid())
)
WITH CHECK (
  invite_type = 'admin'
  AND public.is_dono(auth.uid())
);

CREATE POLICY user_invitations_update_admin_own_scope_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type IN ('gestor', 'auxiliar')
  AND status = 'pending'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
)
WITH CHECK (
  invite_type IN ('gestor', 'auxiliar')
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

CREATE POLICY user_invitations_update_gestor_own_auxiliar_scope_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type = 'auxiliar'
  AND status = 'pending'
  AND public.is_gestor(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
)
WITH CHECK (
  invite_type = 'auxiliar'
  AND public.is_gestor(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

-- ============================================================================
-- 4) ACEITE DO CONVITE: suporte a auxiliar
-- ============================================================================
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
    IF v_current_role IN ('dono', 'admin', 'gestor') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'role_conflict',
        'message', 'Não é permitido rebaixar automaticamente usuário dono/admin/gestor para auxiliar.'
      );
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

-- ============================================================================
-- 5) RLS domínio: auxiliares herdam escopo do owner
-- ============================================================================
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operacoes_select_by_network_role ON public.operacoes;
DROP POLICY IF EXISTS operacoes_insert_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_update_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_delete_own ON public.operacoes;

CREATE POLICY operacoes_select_by_network_role
ON public.operacoes
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY operacoes_insert_own
ON public.operacoes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY operacoes_update_own
ON public.operacoes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY operacoes_delete_own
ON public.operacoes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS despesas_select_by_network_role ON public.despesas;
DROP POLICY IF EXISTS despesas_insert_own ON public.despesas;
DROP POLICY IF EXISTS despesas_update_own ON public.despesas;
DROP POLICY IF EXISTS despesas_delete_own ON public.despesas;

CREATE POLICY despesas_select_by_network_role
ON public.despesas
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY despesas_insert_own
ON public.despesas
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY despesas_update_own
ON public.despesas
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY despesas_delete_own
ON public.despesas
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

DROP POLICY IF EXISTS lancamentos_select_by_network_role ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_insert_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_update_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_delete_by_operacao_owner ON public.lancamentos;

CREATE POLICY lancamentos_select_by_network_role
ON public.lancamentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        public.is_dono(auth.uid())
        OR o.user_id = auth.uid()
        OR (
          public.is_admin(auth.uid())
          AND public.is_admin_of_gestor(auth.uid(), o.user_id)
        )
        OR (
          public.is_auxiliar(auth.uid())
          AND o.user_id = public.get_auxiliar_owner_id(auth.uid())
        )
      )
  )
);

CREATE POLICY lancamentos_insert_by_operacao_owner
ON public.lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND o.user_id = public.get_auxiliar_owner_id(auth.uid())
        )
      )
  )
);

CREATE POLICY lancamentos_update_by_operacao_owner
ON public.lancamentos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND o.user_id = public.get_auxiliar_owner_id(auth.uid())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND o.user_id = public.get_auxiliar_owner_id(auth.uid())
        )
      )
  )
);

CREATE POLICY lancamentos_delete_by_operacao_owner
ON public.lancamentos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND o.user_id = public.get_auxiliar_owner_id(auth.uid())
        )
      )
  )
);
