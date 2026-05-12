-- 032_platform_access_control.sql
-- Camada de acesso da plataforma + compartilhamento controlado do Aliado Financeiro.

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('dashboard_ads', 'aliado_financeiro')),
  enabled boolean NOT NULL DEFAULT true,
  granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.platform_user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nome text NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  modules text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  CONSTRAINT platform_user_invitations_modules_check
    CHECK (
      modules <@ ARRAY['dashboard_ads', 'aliado_financeiro']::text[]
      AND array_length(modules, 1) IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS public.financeiro_shared_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_user_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  token text NOT NULL UNIQUE,
  permission_level text NOT NULL CHECK (permission_level IN ('view', 'edit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user
  ON public.user_module_permissions (user_id, module_key, enabled);

CREATE INDEX IF NOT EXISTS idx_platform_user_invitations_invited_by
  ON public.platform_user_invitations (invited_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_user_invitations_email
  ON public.platform_user_invitations ((lower(trim(email))), status);

CREATE INDEX IF NOT EXISTS idx_financeiro_shared_access_owner
  ON public.financeiro_shared_access (owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financeiro_shared_access_shared
  ON public.financeiro_shared_access (shared_user_id, status);

CREATE INDEX IF NOT EXISTS idx_financeiro_shared_access_email
  ON public.financeiro_shared_access ((lower(trim(invited_email))), status);

CREATE OR REPLACE FUNCTION public.platform_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_module_permissions_updated_at ON public.user_module_permissions;
CREATE TRIGGER trg_user_module_permissions_updated_at
BEFORE UPDATE ON public.user_module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.platform_set_updated_at();

CREATE OR REPLACE FUNCTION public.can_manage_platform_users(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_dono(check_user_id) OR public.is_admin(check_user_id);
$$;

CREATE OR REPLACE FUNCTION public.user_has_module_enabled(
  check_user_id uuid,
  p_module_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_module_permissions ump
    WHERE ump.user_id = check_user_id
      AND ump.module_key = p_module_key
      AND ump.enabled = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_dashboard_access(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_rows boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_module_permissions ump
    WHERE ump.user_id = check_user_id
  )
  INTO v_has_rows;

  IF NOT v_has_rows THEN
    RETURN true;
  END IF;

  RETURN public.user_has_module_enabled(check_user_id, 'dashboard_ads');
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_aliado_access(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_module_enabled(check_user_id, 'aliado_financeiro');
$$;

CREATE OR REPLACE FUNCTION public.financeiro_can_view_owner(
  p_owner_user_id uuid,
  p_viewer_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_owner_user_id = p_viewer_user_id
    OR EXISTS (
      SELECT 1
      FROM public.financeiro_shared_access fsa
      WHERE fsa.owner_user_id = p_owner_user_id
        AND fsa.shared_user_id = p_viewer_user_id
        AND fsa.status = 'accepted'
        AND fsa.permission_level IN ('view', 'edit')
    );
$$;

CREATE OR REPLACE FUNCTION public.financeiro_can_edit_owner(
  p_owner_user_id uuid,
  p_viewer_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_owner_user_id = p_viewer_user_id
    OR EXISTS (
      SELECT 1
      FROM public.financeiro_shared_access fsa
      WHERE fsa.owner_user_id = p_owner_user_id
        AND fsa.shared_user_id = p_viewer_user_id
        AND fsa.status = 'accepted'
        AND fsa.permission_level = 'edit'
    );
$$;

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_shared_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_module_permissions_select_own ON public.user_module_permissions;
CREATE POLICY user_module_permissions_select_own
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS platform_user_invitations_select_manager_own ON public.platform_user_invitations;
DROP POLICY IF EXISTS platform_user_invitations_insert_manager_own ON public.platform_user_invitations;
DROP POLICY IF EXISTS platform_user_invitations_update_manager_own ON public.platform_user_invitations;
DROP POLICY IF EXISTS platform_user_invitations_delete_manager_own ON public.platform_user_invitations;

CREATE POLICY platform_user_invitations_select_manager_own
ON public.platform_user_invitations
FOR SELECT
TO authenticated
USING (
  invited_by = auth.uid()
  AND public.can_manage_platform_users(auth.uid())
);

CREATE POLICY platform_user_invitations_insert_manager_own
ON public.platform_user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND public.can_manage_platform_users(auth.uid())
);

CREATE POLICY platform_user_invitations_update_manager_own
ON public.platform_user_invitations
FOR UPDATE
TO authenticated
USING (
  invited_by = auth.uid()
  AND public.can_manage_platform_users(auth.uid())
)
WITH CHECK (
  invited_by = auth.uid()
  AND public.can_manage_platform_users(auth.uid())
);

CREATE POLICY platform_user_invitations_delete_manager_own
ON public.platform_user_invitations
FOR DELETE
TO authenticated
USING (
  invited_by = auth.uid()
  AND public.can_manage_platform_users(auth.uid())
);

DROP POLICY IF EXISTS financeiro_shared_access_select_owner_or_shared ON public.financeiro_shared_access;
DROP POLICY IF EXISTS financeiro_shared_access_insert_owner ON public.financeiro_shared_access;
DROP POLICY IF EXISTS financeiro_shared_access_update_owner ON public.financeiro_shared_access;
DROP POLICY IF EXISTS financeiro_shared_access_delete_owner ON public.financeiro_shared_access;

CREATE POLICY financeiro_shared_access_select_owner_or_shared
ON public.financeiro_shared_access
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR shared_user_id = auth.uid()
  OR lower(trim(invited_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

CREATE POLICY financeiro_shared_access_insert_owner
ON public.financeiro_shared_access
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
  AND invited_by = auth.uid()
);

CREATE POLICY financeiro_shared_access_update_owner
ON public.financeiro_shared_access
FOR UPDATE
TO authenticated
USING (
  owner_user_id = auth.uid()
)
WITH CHECK (
  owner_user_id = auth.uid()
  AND invited_by = auth.uid()
);

CREATE POLICY financeiro_shared_access_delete_owner
ON public.financeiro_shared_access
FOR DELETE
TO authenticated
USING (
  owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS financeiro_categorias_select_shared_view ON public.financeiro_categorias;
DROP POLICY IF EXISTS financeiro_subcategorias_select_shared_view ON public.financeiro_subcategorias;
DROP POLICY IF EXISTS financeiro_lancamentos_select_shared_view ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_insert_shared_edit ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_update_shared_edit ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_lancamentos_delete_shared_edit ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS financeiro_metas_categoria_select_shared_view ON public.financeiro_metas_categoria;

CREATE POLICY financeiro_categorias_select_shared_view
ON public.financeiro_categorias
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner(user_id, auth.uid()));

CREATE POLICY financeiro_subcategorias_select_shared_view
ON public.financeiro_subcategorias
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner(user_id, auth.uid()));

CREATE POLICY financeiro_lancamentos_select_shared_view
ON public.financeiro_lancamentos
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner(user_id, auth.uid()));

CREATE POLICY financeiro_lancamentos_insert_shared_edit
ON public.financeiro_lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  public.financeiro_can_edit_owner(user_id, auth.uid())
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = user_id
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = user_id
  ))
);

CREATE POLICY financeiro_lancamentos_update_shared_edit
ON public.financeiro_lancamentos
FOR UPDATE
TO authenticated
USING (
  public.financeiro_can_edit_owner(user_id, auth.uid())
)
WITH CHECK (
  public.financeiro_can_edit_owner(user_id, auth.uid())
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = user_id
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = user_id
  ))
);

CREATE POLICY financeiro_lancamentos_delete_shared_edit
ON public.financeiro_lancamentos
FOR DELETE
TO authenticated
USING (
  public.financeiro_can_edit_owner(user_id, auth.uid())
);

CREATE POLICY financeiro_metas_categoria_select_shared_view
ON public.financeiro_metas_categoria
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner(user_id, auth.uid()));

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
    IF v_module NOT IN ('dashboard_ads', 'aliado_financeiro') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'invalid_module',
        'message', 'Convite contém módulo inválido.'
      );
    END IF;

    INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
    VALUES (v_user_id, v_module, true, v_invite.invited_by)
    ON CONFLICT (user_id, module_key)
    DO UPDATE SET
      enabled = true,
      granted_by = COALESCE(EXCLUDED.granted_by, public.user_module_permissions.granted_by),
      updated_at = now();
  END LOOP;

  UPDATE public.platform_user_invitations
  SET
    status = 'accepted',
    accepted_at = now()
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

CREATE OR REPLACE FUNCTION public.accept_financeiro_shared_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_share public.financeiro_shared_access%ROWTYPE;
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
  INTO v_share
  FROM public.financeiro_shared_access
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_found',
      'message', 'Convite financeiro não encontrado.'
    );
  END IF;

  IF v_share.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invite_not_pending',
      'message', 'Este convite financeiro não está mais pendente.'
    );
  END IF;

  IF lower(trim(v_share.invited_email)) <> v_user_email THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'email_mismatch',
      'message', 'Este convite pertence a outro email.'
    );
  END IF;

  IF v_share.owner_user_id = v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'owner_conflict',
      'message', 'Você já é o dono desse financeiro.'
    );
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (v_user_id, 'gestor')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_module_permissions (user_id, module_key, enabled, granted_by)
  VALUES (v_user_id, 'aliado_financeiro', true, v_share.invited_by)
  ON CONFLICT (user_id, module_key)
  DO UPDATE SET
    enabled = true,
    granted_by = COALESCE(EXCLUDED.granted_by, public.user_module_permissions.granted_by),
    updated_at = now();

  UPDATE public.financeiro_shared_access
  SET
    shared_user_id = v_user_id,
    status = 'accepted',
    accepted_at = now()
  WHERE id = v_share.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'code', 'accepted',
    'message', 'Compartilhamento financeiro aceito com sucesso.',
    'owner_user_id', v_share.owner_user_id,
    'permission_level', v_share.permission_level
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_financeiro_shared_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_financeiro_shared_invite(text) TO authenticated;
