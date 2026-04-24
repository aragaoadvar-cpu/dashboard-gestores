-- 010_user_invitations_rls_and_helpers.sql
-- RLS and helper functions for invitation creation/reading.
-- This migration does NOT implement invitation acceptance flow yet.

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_select_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_admin_own_gestor_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_select_invited_user ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_dono_admin_type ON public.user_invitations;
DROP POLICY IF EXISTS user_invitations_insert_admin_gestor_type ON public.user_invitations;

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
    ELSE FALSE
  END;
$$;

-- DONO: can read admin invitations.
CREATE POLICY user_invitations_select_dono_admin_type
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type = 'admin'
  AND public.is_dono(auth.uid())
);

-- ADMIN: can read gestor invitations created by self.
CREATE POLICY user_invitations_select_admin_own_gestor_type
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  invite_type = 'gestor'
  AND public.is_admin(auth.uid())
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
);

-- Invited authenticated user: can read invitations addressed to own email.
CREATE POLICY user_invitations_select_invited_user
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  normalized_email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

-- DONO: can create admin invitations only.
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

-- ADMIN: can create gestor invitations only for own hierarchy.
CREATE POLICY user_invitations_insert_admin_gestor_type
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  invite_type = 'gestor'
  AND invited_by_user_id = auth.uid()
  AND target_admin_user_id = auth.uid()
  AND public.can_invite(auth.uid(), invite_type)
);

-- Intentionally no UPDATE/DELETE policies in this phase.
-- Revocation and acceptance flows will be added in a later backend step.
