-- 009_create_user_invitations.sql
-- Base table for MVP invitations:
-- - dono -> admin
-- - admin -> gestor

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_email text NOT NULL,
  normalized_email text NOT NULL,
  invite_type text NOT NULL CHECK (invite_type IN ('admin', 'gestor')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  accepted_by_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  target_admin_user_id uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT user_invitations_target_admin_by_type_check CHECK (
    (invite_type = 'admin' AND target_admin_user_id IS NULL)
    OR (invite_type = 'gestor' AND target_admin_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_normalized_email
  ON public.user_invitations (normalized_email);

CREATE INDEX IF NOT EXISTS idx_user_invitations_status
  ON public.user_invitations (status);

CREATE INDEX IF NOT EXISTS idx_user_invitations_lookup
  ON public.user_invitations (invite_type, status, invited_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email_status
  ON public.user_invitations (normalized_email, status);

COMMENT ON TABLE public.user_invitations IS
'MVP convite por email (dono->admin, admin->gestor). Regra de não rebaixar dono/admin no aceite de gestor será validada na camada de aplicação/backend.';
