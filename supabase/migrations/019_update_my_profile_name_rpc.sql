-- 019_update_my_profile_name_rpc.sql
-- Permite que o usuário autenticado atualize apenas o próprio nome
-- sem abrir UPDATE direto em public.profiles para todos.

CREATE OR REPLACE FUNCTION public.update_my_profile_name(p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'Nome é obrigatório.';
  END IF;

  UPDATE public.profiles
  SET nome = v_nome,
      updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, role, nome)
    VALUES (v_user_id, 'gestor', v_nome)
    ON CONFLICT (id)
    DO UPDATE SET
      nome = EXCLUDED.nome,
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile_name(text) TO authenticated;

