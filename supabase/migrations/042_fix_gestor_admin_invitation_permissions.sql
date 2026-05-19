-- 042_fix_gestor_admin_invitation_permissions.sql
-- Corrige o fluxo de convites para que apenas admin possa criar/gerenciar convites
-- de gestor_admin. Dono segue responsável apenas por convites admin.

CREATE OR REPLACE FUNCTION public.can_invite(inviter_id uuid, desired_invite_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN desired_invite_type = 'admin' THEN public.is_dono(inviter_id)
    WHEN desired_invite_type = 'gestor_admin' THEN public.is_admin(inviter_id)
    WHEN desired_invite_type = 'gestor' THEN public.is_operational_admin(inviter_id)
    WHEN desired_invite_type = 'auxiliar' THEN public.is_operational_admin(inviter_id) OR public.is_gestor(inviter_id)
    ELSE FALSE
  END;
$$;

DROP POLICY IF EXISTS user_invitations_select_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_gestor_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_gestor_own_auxiliar_scope ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_gestor_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_scope_for_gestor_auxiliar ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_gestor_auxiliar_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_dono_admin_type_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_admin_own_gestor_admin_type_pending ON public.user_invitations;
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

CREATE POLICY user_invitations_select_admin_own_gestor_admin_type
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type = 'gestor_admin'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
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
  invite_type = 'admin'
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
  AND public.can_invite(auth.uid(), invite_type)
);

CREATE POLICY user_invitations_insert_admin_gestor_admin_type
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type = 'gestor_admin'
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
  AND public.is_admin(auth.uid())
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
  invite_type = 'admin'
  AND public.is_dono(auth.uid())
  AND status = 'pending'
)
WITH CHECK (
  invite_type = 'admin'
  AND public.is_dono(auth.uid())
);

CREATE POLICY user_invitations_update_admin_own_gestor_admin_type_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type = 'gestor_admin'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
  AND status = 'pending'
)
WITH CHECK (
  invite_type = 'gestor_admin'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id IS NULL
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
