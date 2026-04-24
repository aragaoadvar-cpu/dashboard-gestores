-- 014_user_invitations_update_policies.sql
-- Allows safe invite management (revoke/regenerate) without service role key.
-- Scope is intentionally narrow:
-- - only pending invitations
-- - owner role constraints by invite type

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_update_dono_admin_type_pending ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_update_admin_own_gestor_type_pending ON public.user_invitations;

-- DONO: can update only pending admin-type invitations.
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

-- ADMIN: can update only own pending gestor invitations.
CREATE POLICY user_invitations_update_admin_own_gestor_type_pending
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (
  invite_type = 'gestor'
  AND status = 'pending'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
)
WITH CHECK (
  invite_type = 'gestor'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);
