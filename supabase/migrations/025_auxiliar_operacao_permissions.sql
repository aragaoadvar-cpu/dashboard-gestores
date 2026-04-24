-- 025_auxiliar_operacao_permissions.sql
-- Controle granular de operações para auxiliares.

-- ============================================================================
-- 1) Tabela de permissões auxiliar x operação
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.operacao_auxiliares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id bigint NOT NULL REFERENCES public.operacoes (id) ON DELETE CASCADE,
  auxiliar_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacao_id, auxiliar_user_id)
);

CREATE INDEX IF NOT EXISTS idx_operacao_auxiliares_auxiliar_user_id
  ON public.operacao_auxiliares (auxiliar_user_id);

CREATE INDEX IF NOT EXISTS idx_operacao_auxiliares_operacao_id
  ON public.operacao_auxiliares (operacao_id);

ALTER TABLE public.operacao_auxiliares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operacao_auxiliares_select_scope ON public.operacao_auxiliares;
DROP POLICY IF EXISTS operacao_auxiliares_insert_scope ON public.operacao_auxiliares;
DROP POLICY IF EXISTS operacao_auxiliares_delete_scope ON public.operacao_auxiliares;

CREATE POLICY operacao_auxiliares_select_scope
ON public.operacao_auxiliares
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR auxiliar_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = operacao_auxiliares.operacao_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY operacao_auxiliares_insert_scope
ON public.operacao_auxiliares
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_dono(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.operacoes o
      WHERE o.id = operacao_auxiliares.operacao_id
        AND o.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.auxiliar_vinculos av
      WHERE av.auxiliar_user_id = operacao_auxiliares.auxiliar_user_id
        AND av.owner_user_id = auth.uid()
        AND av.status = 'ativo'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = operacao_auxiliares.auxiliar_user_id
        AND p.role = 'auxiliar'
    )
  )
);

CREATE POLICY operacao_auxiliares_delete_scope
ON public.operacao_auxiliares
FOR DELETE
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.operacoes o
      WHERE o.id = operacao_auxiliares.operacao_id
        AND o.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.auxiliar_vinculos av
      WHERE av.auxiliar_user_id = operacao_auxiliares.auxiliar_user_id
        AND av.owner_user_id = auth.uid()
        AND av.status = 'ativo'
    )
  )
);

-- ============================================================================
-- 2) Helper de permissão auxiliar por operação
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auxiliar_pode_acessar_operacao(check_operacao_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_auxiliar(v_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT o.user_id
  INTO v_owner_id
  FROM public.operacoes o
  WHERE o.id = check_operacao_id;

  IF v_owner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.auxiliar_vinculos av
    WHERE av.auxiliar_user_id = v_user_id
      AND av.owner_user_id = v_owner_id
      AND av.status = 'ativo'
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.operacao_auxiliares oa
    WHERE oa.operacao_id = check_operacao_id
      AND oa.auxiliar_user_id = v_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.auxiliar_pode_acessar_operacao(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auxiliar_pode_acessar_operacao(bigint) TO authenticated;

-- ============================================================================
-- 3) Auto-permissão na criação de operação por auxiliar
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_operacao_to_creator_auxiliar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_auxiliar(v_user_id)
     AND EXISTS (
       SELECT 1
       FROM public.auxiliar_vinculos av
       WHERE av.auxiliar_user_id = v_user_id
         AND av.owner_user_id = NEW.user_id
         AND av.status = 'ativo'
     ) THEN
    INSERT INTO public.operacao_auxiliares (
      operacao_id,
      auxiliar_user_id,
      created_by_user_id
    )
    VALUES (
      NEW.id,
      v_user_id,
      v_user_id
    )
    ON CONFLICT (operacao_id, auxiliar_user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_operacao_to_creator_auxiliar ON public.operacoes;

CREATE TRIGGER trg_grant_operacao_to_creator_auxiliar
AFTER INSERT ON public.operacoes
FOR EACH ROW
EXECUTE FUNCTION public.grant_operacao_to_creator_auxiliar();

-- ============================================================================
-- 4) Ajustes de RLS para operações e lançamentos (escopo auxiliar granular)
-- ============================================================================
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operacoes_select_by_network_role ON public.operacoes;
DROP POLICY IF EXISTS operacoes_insert_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_update_own ON public.operacoes;
DROP POLICY IF EXISTS operacoes_delete_own ON public.operacoes;

CREATE POLICY operacoes_select_by_network_role
ON public.operacoes
FOR SELECT
TO authenticated
USING (
  public.is_dono(auth.uid())
  OR user_id = auth.uid()
  OR (
    public.is_admin(auth.uid())
    AND public.is_admin_of_gestor(auth.uid(), user_id)
  )
  OR (
    public.is_auxiliar(auth.uid())
    AND public.auxiliar_pode_acessar_operacao(id)
  )
);

CREATE POLICY operacoes_insert_own
ON public.operacoes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    public.is_auxiliar(auth.uid())
    AND user_id = public.get_auxiliar_owner_id(auth.uid())
  )
);

CREATE POLICY operacoes_update_own
ON public.operacoes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY operacoes_delete_own
ON public.operacoes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS lancamentos_select_by_network_role ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_insert_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_update_by_operacao_owner ON public.lancamentos;
DROP POLICY IF EXISTS lancamentos_delete_by_operacao_owner ON public.lancamentos;

CREATE POLICY lancamentos_select_by_network_role
ON public.lancamentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        public.is_dono(auth.uid())
        OR o.user_id = auth.uid()
        OR (
          public.is_admin(auth.uid())
          AND public.is_admin_of_gestor(auth.uid(), o.user_id)
        )
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
);

CREATE POLICY lancamentos_insert_by_operacao_owner
ON public.lancamentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
);

CREATE POLICY lancamentos_update_by_operacao_owner
ON public.lancamentos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
);

CREATE POLICY lancamentos_delete_by_operacao_owner
ON public.lancamentos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.operacoes o
    WHERE o.id = lancamentos.operacao_id
      AND (
        o.user_id = auth.uid()
        OR (
          public.is_auxiliar(auth.uid())
          AND public.auxiliar_pode_acessar_operacao(o.id)
        )
      )
  )
);
