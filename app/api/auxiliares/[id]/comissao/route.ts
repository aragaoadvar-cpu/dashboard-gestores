import { createClient } from "@/lib/supabase/server";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";

type ComissaoPayload = {
  mes?: number;
  ano?: number;
  percentual_comissao?: number;
  percentual_desconto?: number;
  despesasExtras?: Array<{
    id?: string;
    nome?: string;
    valor?: number;
  }>;
};

type DespesaExtraComissao = {
  id: string;
  nome: string;
  valor: number | null;
};

function parseRole(role: string | null | undefined): RoleUsuario {
  if (role === "dono") return "dono";
  if (role === "admin") return "admin";
  if (role === "gestor") return "gestor";
  return "auxiliar";
}

function getMesAnoAtual() {
  const agora = new Date();
  return {
    mes: agora.getMonth() + 1,
    ano: agora.getFullYear(),
  };
}

function normalizarMesAno(mes: number, ano: number) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2000) {
    return null;
  }

  return { mes, ano };
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

  const { error: vinculoMsg, vinculo } = await carregarEscopoAuxiliar(supabase, auxiliarId);
  if (vinculoMsg || !vinculo) {
    return Response.json({ success: false, error: vinculoMsg }, { status: 404 });
  }

  if ((roleUsuario === "admin" || roleUsuario === "gestor") && vinculo.owner_user_id !== user.id) {
    return Response.json(
      { success: false, error: "Você só pode ajustar comissão de auxiliares vinculados ao seu escopo." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const periodoAtual = getMesAnoAtual();
  const periodo = normalizarMesAno(
    Number(url.searchParams.get("mes") ?? periodoAtual.mes),
    Number(url.searchParams.get("ano") ?? periodoAtual.ano)
  );

  if (!periodo) {
    return Response.json(
      { success: false, error: "Mês/ano inválidos para configuração da comissão." },
      { status: 400 }
    );
  }

  const { data: comissaoData, error: comissaoError } = await supabase
    .from("auxiliar_comissoes")
    .select("id, percentual_comissao, percentual_desconto, ativo, mes, ano")
    .eq("convidador_user_id", user.id)
    .eq("auxiliar_user_id", auxiliarId)
    .eq("mes", periodo.mes)
    .eq("ano", periodo.ano)
    .maybeSingle();

  if (comissaoError) {
    return Response.json(
      { success: false, error: `Erro ao carregar comissão do auxiliar: ${comissaoError.message}` },
      { status: 500 }
    );
  }

  let despesasExtras: DespesaExtraComissao[] = [];

  if (comissaoData?.id) {
    const { data: despesasExtrasData, error: despesasExtrasError } = await supabase
      .from("auxiliar_comissao_despesas_extras")
      .select("id, nome, valor")
      .eq("auxiliar_comissao_id", comissaoData.id)
      .eq("mes", periodo.mes)
      .eq("ano", periodo.ano)
      .order("created_at", { ascending: true });

    if (despesasExtrasError) {
      return Response.json(
        {
          success: false,
          error: `Erro ao carregar despesas extras da comissão: ${despesasExtrasError.message}`,
        },
        { status: 500 }
      );
    }

    despesasExtras = (despesasExtrasData as DespesaExtraComissao[]) || [];
  }

  return Response.json(
    {
      success: true,
      auxiliar_user_id: auxiliarId,
      comissao: comissaoData
        ? {
            id: comissaoData.id,
            percentual_comissao: Number(comissaoData.percentual_comissao ?? 0),
            percentual_desconto: Number(comissaoData.percentual_desconto ?? 0),
            ativo: Boolean(comissaoData.ativo),
            mes: Number(comissaoData.mes ?? periodo.mes),
            ano: Number(comissaoData.ano ?? periodo.ano),
          }
        : null,
      despesasExtras: despesasExtras.map((item) => ({
        id: item.id,
        nome: item.nome,
        valor: Number(item.valor ?? 0),
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

  let body: ComissaoPayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const percentualComissao = Number(body.percentual_comissao);
  const percentualDesconto = Number(body.percentual_desconto);
  const periodoAtual = getMesAnoAtual();
  const periodo = normalizarMesAno(
    Number(body.mes ?? periodoAtual.mes),
    Number(body.ano ?? periodoAtual.ano)
  );
  const despesasExtrasPayload = Array.isArray(body.despesasExtras) ? body.despesasExtras : [];

  if (!periodo) {
    return Response.json(
      { success: false, error: "Mês/ano inválidos para configuração da comissão." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(percentualComissao) || !Number.isFinite(percentualDesconto)) {
    return Response.json(
      { success: false, error: "Percentuais de comissão e desconto devem ser numéricos." },
      { status: 400 }
    );
  }

  const { error: vinculoMsg, vinculo } = await carregarEscopoAuxiliar(supabase, auxiliarId);
  if (vinculoMsg || !vinculo) {
    return Response.json({ success: false, error: vinculoMsg }, { status: 404 });
  }

  if ((roleUsuario === "admin" || roleUsuario === "gestor") && vinculo.owner_user_id !== user.id) {
    return Response.json(
      { success: false, error: "Você só pode ajustar comissão de auxiliares vinculados ao seu escopo." },
      { status: 403 }
    );
  }

  const { data: registroExistente, error: registroError } = await supabase
    .from("auxiliar_comissoes")
    .select("id")
    .eq("convidador_user_id", user.id)
    .eq("auxiliar_user_id", auxiliarId)
    .eq("mes", periodo.mes)
    .eq("ano", periodo.ano)
    .maybeSingle();

  if (registroError) {
    return Response.json(
      { success: false, error: `Erro ao validar comissão existente: ${registroError.message}` },
      { status: 500 }
    );
  }

  const payload = {
    convidador_user_id: user.id,
    auxiliar_user_id: auxiliarId,
    mes: periodo.mes,
    ano: periodo.ano,
    percentual_comissao: percentualComissao,
    percentual_desconto: percentualDesconto,
    ativo: true,
  };

  let auxiliarComissaoId = registroExistente?.id ?? null;

  if (registroExistente?.id) {
    const { error: updateError } = await supabase
      .from("auxiliar_comissoes")
      .update({
        percentual_comissao: percentualComissao,
        percentual_desconto: percentualDesconto,
        mes: periodo.mes,
        ano: periodo.ano,
        ativo: true,
      })
      .eq("id", registroExistente.id)
      .eq("convidador_user_id", user.id)
      .eq("auxiliar_user_id", auxiliarId)
      .eq("mes", periodo.mes)
      .eq("ano", periodo.ano);

    if (updateError) {
      return Response.json(
        { success: false, error: `Erro ao atualizar comissão: ${updateError.message}` },
        { status: 500 }
      );
    }
  } else {
    const { data: insertData, error: insertError } = await supabase
      .from("auxiliar_comissoes")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      return Response.json(
        { success: false, error: `Erro ao criar comissão: ${insertError.message}` },
        { status: 500 }
      );
    }

    auxiliarComissaoId = insertData?.id ?? null;
  }

  if (!auxiliarComissaoId) {
    return Response.json(
      { success: false, error: "Não foi possível identificar a comissão do auxiliar." },
      { status: 500 }
    );
  }

  const despesasExtrasNormalizadas = despesasExtrasPayload
    .map((item) => ({
      id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : null,
      nome: typeof item?.nome === "string" ? item.nome.trim() : "",
      valor: Number(item?.valor ?? 0),
    }))
    .filter((item) => item.nome && Number.isFinite(item.valor));

  const { data: despesasExistentesData, error: despesasExistentesError } = await supabase
    .from("auxiliar_comissao_despesas_extras")
    .select("id")
    .eq("auxiliar_comissao_id", auxiliarComissaoId);

  if (despesasExistentesError) {
    return Response.json(
      {
        success: false,
        error: `Erro ao carregar despesas extras existentes: ${despesasExistentesError.message}`,
      },
      { status: 500 }
    );
  }

  const idsMantidos = new Set(
    despesasExtrasNormalizadas
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
  );

  const idsParaRemover = ((despesasExistentesData || []) as Array<{ id: string }>).map((item) => item.id)
    .filter((id) => !idsMantidos.has(id));

  if (idsParaRemover.length > 0) {
    const { error: deleteError } = await supabase
      .from("auxiliar_comissao_despesas_extras")
      .delete()
      .in("id", idsParaRemover)
      .eq("auxiliar_comissao_id", auxiliarComissaoId);

    if (deleteError) {
      return Response.json(
        {
          success: false,
          error: `Erro ao remover despesas extras: ${deleteError.message}`,
        },
        { status: 500 }
      );
    }
  }

  for (const despesaExtra of despesasExtrasNormalizadas) {
    if (despesaExtra.id) {
      const { error: updateDespesaError } = await supabase
        .from("auxiliar_comissao_despesas_extras")
        .update({
          nome: despesaExtra.nome,
          valor: despesaExtra.valor,
          mes: periodo.mes,
          ano: periodo.ano,
          updated_at: new Date().toISOString(),
        })
        .eq("id", despesaExtra.id)
        .eq("auxiliar_comissao_id", auxiliarComissaoId);

      if (updateDespesaError) {
        return Response.json(
          {
            success: false,
            error: `Erro ao atualizar despesa extra: ${updateDespesaError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      const { error: insertDespesaError } = await supabase
        .from("auxiliar_comissao_despesas_extras")
        .insert({
          auxiliar_comissao_id: auxiliarComissaoId,
          nome: despesaExtra.nome,
          valor: despesaExtra.valor,
          mes: periodo.mes,
          ano: periodo.ano,
        });

      if (insertDespesaError) {
        return Response.json(
          {
            success: false,
            error: `Erro ao criar despesa extra: ${insertDespesaError.message}`,
          },
          { status: 500 }
        );
      }
    }
  }

  return Response.json(
    {
      success: true,
      auxiliar_user_id: auxiliarId,
      convidador_user_id: user.id,
      message: "Comissão do auxiliar salva com sucesso.",
    },
    { status: 200 }
  );
}
