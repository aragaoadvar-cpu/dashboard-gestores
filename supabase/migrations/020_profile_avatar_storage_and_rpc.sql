-- 020_profile_avatar_storage_and_rpc.sql
-- V1 avatar de perfil:
-- 1) adiciona coluna avatar_path em public.profiles
-- 2) cria RPC segura para atualizar/remover avatar do próprio usuário
-- 3) cria bucket e policies de upload para avatar

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_path text;

CREATE OR REPLACE FUNCTION public.update_my_profile_avatar(p_avatar_path text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_avatar_path text := nullif(btrim(coalesce(p_avatar_path, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  UPDATE public.profiles
  SET avatar_path = v_avatar_path,
      updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, role, nome, avatar_path)
    VALUES (v_user_id, 'gestor', null, v_avatar_path)
    ON CONFLICT (id)
    DO UPDATE SET
      avatar_path = EXCLUDED.avatar_path,
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile_avatar(text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS profile_avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_delete_own ON storage.objects;

CREATE POLICY profile_avatars_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY profile_avatars_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY profile_avatars_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
