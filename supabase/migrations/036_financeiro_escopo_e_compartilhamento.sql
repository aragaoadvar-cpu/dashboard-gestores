-- 036_financeiro_escopo_e_compartilhamento.sql
-- Separa Aliado Financeiro em escopos pessoal/empresarial e evolui compartilhamento por escopo.

ALTER TABLE public.financeiro_categorias
ADD COLUMN IF NOT EXISTS escopo text;

UPDATE public.financeiro_categorias
SET escopo = 'pessoal'
WHERE escopo IS NULL;

ALTER TABLE public.financeiro_categorias
ALTER COLUMN escopo SET DEFAULT 'pessoal';

ALTER TABLE public.financeiro_categorias
ALTER COLUMN escopo SET NOT NULL;

ALTER TABLE public.financeiro_subcategorias
ADD COLUMN IF NOT EXISTS escopo text;

UPDATE public.financeiro_subcategorias
SET escopo = 'pessoal'
WHERE escopo IS NULL;

ALTER TABLE public.financeiro_subcategorias
ALTER COLUMN escopo SET DEFAULT 'pessoal';

ALTER TABLE public.financeiro_subcategorias
ALTER COLUMN escopo SET NOT NULL;

ALTER TABLE public.financeiro_lancamentos
ADD COLUMN IF NOT EXISTS escopo text;

UPDATE public.financeiro_lancamentos
SET escopo = 'pessoal'
WHERE escopo IS NULL;

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN escopo SET DEFAULT 'pessoal';

ALTER TABLE public.financeiro_lancamentos
ALTER COLUMN escopo SET NOT NULL;

ALTER TABLE public.financeiro_metas_categoria
ADD COLUMN IF NOT EXISTS escopo text;

UPDATE public.financeiro_metas_categoria
SET escopo = 'pessoal'
WHERE escopo IS NULL;

ALTER TABLE public.financeiro_metas_categoria
ALTER COLUMN escopo SET DEFAULT 'pessoal';

ALTER TABLE public.financeiro_metas_categoria
ALTER COLUMN escopo SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_categorias_escopo_check'
  ) THEN
    ALTER TABLE public.financeiro_categorias
    ADD CONSTRAINT financeiro_categorias_escopo_check
    CHECK (escopo IN ('pessoal', 'empresarial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_subcategorias_escopo_check'
  ) THEN
    ALTER TABLE public.financeiro_subcategorias
    ADD CONSTRAINT financeiro_subcategorias_escopo_check
    CHECK (escopo IN ('pessoal', 'empresarial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_lancamentos_escopo_check'
  ) THEN
    ALTER TABLE public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_escopo_check
    CHECK (escopo IN ('pessoal', 'empresarial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_metas_categoria_escopo_check'
  ) THEN
    ALTER TABLE public.financeiro_metas_categoria
    ADD CONSTRAINT financeiro_metas_categoria_escopo_check
    CHECK (escopo IN ('pessoal', 'empresarial'));
  END IF;
END
$$;

ALTER TABLE public.financeiro_shared_access
ADD COLUMN IF NOT EXISTS escopos text[];

UPDATE public.financeiro_shared_access
SET escopos = ARRAY['pessoal', 'empresarial']::text[]
WHERE escopos IS NULL;

ALTER TABLE public.financeiro_shared_access
ALTER COLUMN escopos SET DEFAULT ARRAY['pessoal', 'empresarial']::text[];

ALTER TABLE public.financeiro_shared_access
ALTER COLUMN escopos SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_shared_access_escopos_check'
  ) THEN
    ALTER TABLE public.financeiro_shared_access
    ADD CONSTRAINT financeiro_shared_access_escopos_check
    CHECK (
      escopos <@ ARRAY['pessoal', 'empresarial']::text[]
      AND array_length(escopos, 1) IS NOT NULL
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_financeiro_categorias_user_escopo_tipo
  ON public.financeiro_categorias (user_id, escopo, tipo);

CREATE INDEX IF NOT EXISTS idx_financeiro_subcategorias_user_escopo_categoria
  ON public.financeiro_subcategorias (user_id, escopo, categoria_id);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_user_escopo_data
  ON public.financeiro_lancamentos (user_id, escopo, data);

CREATE INDEX IF NOT EXISTS idx_financeiro_metas_categoria_user_escopo_periodo
  ON public.financeiro_metas_categoria (user_id, escopo, mes, ano);

CREATE OR REPLACE FUNCTION public.financeiro_can_view_owner_scope(
  p_owner_user_id uuid,
  p_escopo text,
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
        AND p_escopo = ANY (fsa.escopos)
    );
$$;

CREATE OR REPLACE FUNCTION public.financeiro_can_edit_owner_scope(
  p_owner_user_id uuid,
  p_escopo text,
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
        AND p_escopo = ANY (fsa.escopos)
    );
$$;

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
USING (public.financeiro_can_view_owner_scope(user_id, escopo, auth.uid()));

CREATE POLICY financeiro_subcategorias_select_shared_view
ON public.financeiro_subcategorias
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner_scope(user_id, escopo, auth.uid()));

CREATE POLICY financeiro_lancamentos_select_shared_view
ON public.financeiro_lancamentos
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner_scope(user_id, escopo, auth.uid()));

CREATE POLICY financeiro_lancamentos_insert_shared_edit
ON public.financeiro_lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  public.financeiro_can_edit_owner_scope(user_id, escopo, auth.uid())
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = user_id
      AND fc.escopo = escopo
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = user_id
      AND fs.escopo = escopo
  ))
);

CREATE POLICY financeiro_lancamentos_update_shared_edit
ON public.financeiro_lancamentos
FOR UPDATE
TO authenticated
USING (
  public.financeiro_can_edit_owner_scope(user_id, escopo, auth.uid())
)
WITH CHECK (
  public.financeiro_can_edit_owner_scope(user_id, escopo, auth.uid())
  AND (categoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_categorias fc
    WHERE fc.id = categoria_id
      AND fc.user_id = user_id
      AND fc.escopo = escopo
  ))
  AND (subcategoria_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.financeiro_subcategorias fs
    WHERE fs.id = subcategoria_id
      AND fs.user_id = user_id
      AND fs.escopo = escopo
  ))
);

CREATE POLICY financeiro_lancamentos_delete_shared_edit
ON public.financeiro_lancamentos
FOR DELETE
TO authenticated
USING (
  public.financeiro_can_edit_owner_scope(user_id, escopo, auth.uid())
);

CREATE POLICY financeiro_metas_categoria_select_shared_view
ON public.financeiro_metas_categoria
FOR SELECT
TO authenticated
USING (public.financeiro_can_view_owner_scope(user_id, escopo, auth.uid()));

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
    'permission_level', v_share.permission_level,
    'escopos', v_share.escopos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_financeiro_shared_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_financeiro_shared_invite(text) TO authenticated;
