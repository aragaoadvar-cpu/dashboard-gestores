-- 004_profiles_rls.sql
-- RLS policies for profiles and helper function to check admin role.

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid DEFAULT auth.uid())
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
      AND p.role = 'admin'
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;

-- Authenticated user reads only own profile.
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Admin reads all profiles.
CREATE POLICY profiles_select_all_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Intentionally no UPDATE policy for authenticated users.
-- Role updates should be performed by administrative/manual SQL only.
