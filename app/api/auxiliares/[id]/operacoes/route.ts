import { createClient } from "@/lib/supabase/server";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";

type OperacaoPermissaoPayload = {
  operacao_ids_permitidas?: number[];
};

function parseRole(role: string | null | undefined): RoleUsuario {
  if (role === "dono") return "dono";
  if (role === "admin") return "admin";
  if (role === "gestor") return "gestor";
  return "auxiliar";
}

async function carregarEscopoAuxiliar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  auxiliarId: string
) {
  const { data: vinculoData, error: vinculoError } = await supabase
    .from("auxiliar_vinculos")
    .select("auxiliar_user_id, owner_user_id, owner_role, status")
    .eq("auxiliar_user_id", auxiliarId)
    .eq("status", "ativo")
    .maybeSingle();

  if (vinculoError) {
    return {
      error: `Erro ao validar vínculo do auxiliar: ${vinculoError.message}`,
      vinculo: null,
    };
  }

  if (!vinculoData) {
    return {
      error: "Auxiliar sem vínculo ativo.",
      vinculo: null,
    };
  }

  return {
    error: null,
    vinculo: vinculoData as {
      auxiliar_user_id: string;
      owner_user_id: string;
      owner_role: "admin" | "gestor" | null;
      status: string;
    },
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: auxiliarId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (actorProfileError || !actorProfile) {
    return Response.json(
      { success: false, error: "Não foi possível carregar o perfil do usuário." },
      { status: 500 }
    );
  }

  const roleUsuario = parseRole(actorProfile.role);
  if (roleUsuario !== "dono" && roleUsuario !== "admin" && roleUsuario !== "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const { error: vinculoMsg, vinculo } = await carregarEscopoAuxiliar(supabase, auxiliarId);
  if (vinculoMsg || !vinculo) {
    return Response.json({ success: false, error: vinculoMsg }, { status: 404 });
  }

  if ((roleUsuario === "admin" || roleUsuario === "gestor") && vinculo.owner_user_id !== user.id) {
    return Response.json(
      { success: false, error: "Você só pode gerenciar auxiliares vinculados ao seu escopo." },
      { status: 403 }
    );
  }

  const { data: operacoesData, error: operacoesError } = await supabase
    .from("operacoes")
    .select("id, nome, mes, ano")
    .eq("user_id", vinculo.owner_user_id)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .order("id", { ascending: true });

  if (operacoesError) {
    return Response.json(
      { success: false, error: `Erro ao carregar operações do owner: ${operacoesError.message}` },
      { status: 500 }
    );
  }

  const operacoes = (operacoesData ||
    []) as Array<{ id: number; nome: string; mes: number; ano: number }>;

  const operacaoIds = operacoes.map((item) => item.id);
  let permissoesSet = new Set<number>();

  if (operacaoIds.length > 0) {
    const { data: permissoesData, error: permissoesError } = await supabase
      .from("operacao_auxiliares")
      .select("operacao_id")
      .eq("auxiliar_user_id", auxiliarId)
      .in("operacao_id", operacaoIds);

    if (permissoesError) {
      return Response.json(
        { success: false, error: `Erro ao carregar permissões: ${permissoesError.message}` },
        { status: 500 }
      );
    }

    permissoesSet = new Set(
      ((permissoesData || []) as Array<{ operacao_id: number }>).map((item) => item.operacao_id)
    );
  }

  return Response.json(
    {
      success: true,
      auxiliar_user_id: auxiliarId,
      owner_user_id: vinculo.owner_user_id,
      operacoes: operacoes.map((item) => ({
        ...item,
        permitida: permissoesSet.has(item.id),
      })),
    },
    { status: 200 }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: auxiliarId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (actorProfileError || !actorProfile) {
    return Response.json(
      { success: false, error: "Não foi possível carregar o perfil do usuário." },
      { status: 500 }
    );
  }

  const roleUsuario = parseRole(actorProfile.role);
  if (roleUsuario !== "dono" && roleUsuario !== "admin" && roleUsuario !== "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: OperacaoPermissaoPayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const idsPermitidosRaw = Array.isArray(body.operacao_ids_permitidas)
    ? body.operacao_ids_permitidas
    : [];

  const idsPermitidos = Array.from(
    new Set(
      idsPermitidosRaw
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );

  const { error: vinculoMsg, vinculo } = await carregarEscopoAuxiliar(supabase, auxiliarId);
  if (vinculoMsg || !vinculo) {
    return Response.json({ success: false, error: vinculoMsg }, { status: 404 });
  }

  if ((roleUsuario === "admin" || roleUsuario === "gestor") && vinculo.owner_user_id !== user.id) {
    return Response.json(
      { success: false, error: "Você só pode gerenciar auxiliares vinculados ao seu escopo." },
      { status: 403 }
    );
  }

  const { data: operacoesOwnerData, error: operacoesOwnerError } = await supabase
    .from("operacoes")
    .select("id")
    .eq("user_id", vinculo.owner_user_id);

  if (operacoesOwnerError) {
    return Response.json(
      {
        success: false,
        error: `Erro ao carregar operações do owner para atualização: ${operacoesOwnerError.message}`,
      },
      { status: 500 }
    );
  }

  const ownerOperationIds = new Set(
    ((operacoesOwnerData || []) as Array<{ id: number }>).map((item) => item.id)
  );

  const idsPermitidosNoEscopo = idsPermitidos.filter((id) => ownerOperationIds.has(id));
  const ownerOperationIdsList = Array.from(ownerOperationIds);

  if (ownerOperationIdsList.length > 0) {
    const { error: deleteError } = await supabase
      .from("operacao_auxiliares")
      .delete()
      .eq("auxiliar_user_id", auxiliarId)
      .in("operacao_id", ownerOperationIdsList);

    if (deleteError) {
      return Response.json(
        { success: false, error: `Erro ao limpar permissões anteriores: ${deleteError.message}` },
        { status: 500 }
      );
    }
  }

  if (idsPermitidosNoEscopo.length > 0) {
    const payload = idsPermitidosNoEscopo.map((operacaoId) => ({
      operacao_id: operacaoId,
      auxiliar_user_id: auxiliarId,
      created_by_user_id: user.id,
    }));

    const { error: insertError } = await supabase
      .from("operacao_auxiliares")
      .upsert(payload, { onConflict: "operacao_id,auxiliar_user_id", ignoreDuplicates: false });

    if (insertError) {
      return Response.json(
        { success: false, error: `Erro ao salvar permissões: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  return Response.json(
    {
      success: true,
      auxiliar_user_id: auxiliarId,
      operacao_ids_permitidas: idsPermitidosNoEscopo,
      message: "Permissões de operações atualizadas com sucesso.",
    },
    { status: 200 }
  );
}
