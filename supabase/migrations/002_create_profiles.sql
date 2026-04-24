-- 002_create_profiles.sql
-- Base table for user roles (admin | gestor), 1:1 with auth.users.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'gestor' CHECK (role IN ('admin', 'gestor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
