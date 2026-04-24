import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSaudeStatus, OwnerAdminCard, OwnerDashboardData } from "./types";

type Operacao = {
  id: number;
  user_id: string | null;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

type Lancamento = {
  operacao_id: number;
  facebook: number | null;
  usd: number | null;
};

type PerfilAdmin = {
  id: string;
  nome: string | null;
};

type VinculoAdminGestor = {
  admin_user_id: string;
  gestor_user_id: string;
  status: string;
};

type UserResumo = {
  totalOperacoes: number;
  receita: number;
  custo: number;
  lucro: number;
  roi: number;
};

const DEFAULT_COTACAO = 5.1;
const DEFAULT_TAXA_FACEBOOK = 13.85;
const DEFAULT_TAXA_NETWORK = 6.5;
const DEFAULT_TAXA_IMPOSTO = 7;

function toNumber(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value);
}

function labelAdmin(perfil: PerfilAdmin): string {
  const nome = perfil.nome?.trim() || "";
  return nome || "Admin sem identificação";
}

function calcularOperacao(operacao: Operacao, lancamentos: Lancamento[]) {
  const cotacao = toNumber(operacao.cotacao_dolar, DEFAULT_COTACAO);
  const taxaFacebook = toNumber(operacao.taxa_facebook, DEFAULT_TAXA_FACEBOOK);
  const taxaNetwork = toNumber(operacao.taxa_network, DEFAULT_TAXA_NETWORK);
  const taxaImposto = toNumber(operacao.taxa_imposto, DEFAULT_TAXA_IMPOSTO);

  let receita = 0;
  let custo = 0;
  let lucro = 0;

  for (const lancamento of lancamentos) {
    const facebook = toNumber(lancamento.facebook);
    const usd = toNumber(lancamento.usd);

    const receitaLinha = usd * cotacao;
    const txFacebook = facebook * (taxaFacebook / 100);
    const txNetwork = receitaLinha * (taxaNetwork / 100);
    const txImposto = receitaLinha * (taxaImposto / 100);
    const custoLinha = facebook + txFacebook + txNetwork + txImposto;
    const lucroLinha = receitaLinha - custoLinha;

    receita += receitaLinha;
    custo += custoLinha;
    lucro += lucroLinha;
  }

  return { receita, custo, lucro };
}

function buildResumoVazio(): UserResumo {
  return {
    totalOperacoes: 0,
    receita: 0,
    custo: 0,
    lucro: 0,
    roi: 0,
  };
}

function calcularSaude(
  consolidado: {
    lucro: number;
    roi: number;
  },
  proprio: {
    lucro: number;
  },
  equipe: {
    totalGestoresAtivos: number;
    gestoresNegativos: number;
    gestoresSemOperacao: number;
  }
): AdminSaudeStatus {
  const totalGestores = equipe.totalGestoresAtivos;
  const proporcaoNegativos =
    totalGestores > 0 ? equipe.gestoresNegativos / totalGestores : 0;

  if (consolidado.lucro < 0 || consolidado.roi < 0) return "Crítico";
  if (totalGestores >= 2 && proporcaoNegativos >= 0.5) return "Crítico";

  if (
    consolidado.roi < 20 ||
    proprio.lucro < 0 ||
    equipe.gestoresNegativos > 0 ||
    equipe.gestoresSemOperacao > 0
  ) {
    return "Atenção";
  }

  return "Saudável";
}

export async function getOwnerDashboardData({
  supabase,
  mes,
  ano,
  debug = false,
}: {
  supabase: SupabaseClient;
  mes: number;
  ano: number;
  debug?: boolean;
}): Promise<OwnerDashboardData> {
  const { data: adminsData, error: adminsError } = await supabase
    .from("profiles")
    .select("id, nome")
    .eq("role", "admin");

  if (adminsError) {
    throw new Error(`Erro ao carregar admins: ${adminsError.message}`);
  }

  const admins = ((adminsData as PerfilAdmin[]) || []).filter((item) => Boolean(item.id));
  const adminIds = admins.map((item) => item.id);

  if (adminIds.length === 0) {
    return {
      resumoGlobal: {
        receitaTotalPlataforma: 0,
        lucroTotalPlataforma: 0,
        roiGlobal: 0,
        totalAdminsAtivos: 0,
      },
      admins: [],
      ...(debug
        ? {
            debug: {
              totalAdminsEncontrados: 0,
              adminIdsEncontrados: [],
              totalVinculosAtivosEncontrados: 0,
              totalGestoresEncontrados: 0,
              gestorIdsEncontrados: [],
              totalOperacoesNoPeriodo: 0,
            },
          }
        : {}),
    };
  }

  const { data: vinculosData, error: vinculosError } = await supabase
    .from("admin_gestores")
    .select("admin_user_id, gestor_user_id, status")
    .in("admin_user_id", adminIds)
    .eq("status", "ativo");

  if (vinculosError) {
    throw new Error(`Erro ao carregar vínculos admin->gestor: ${vinculosError.message}`);
  }

  const vinculos = (vinculosData as VinculoAdminGestor[]) || [];
  const gestorIds = Array.from(
    new Set(vinculos.map((item) => item.gestor_user_id).filter((id): id is string => Boolean(id)))
  );

  const ownerIds = Array.from(new Set([...adminIds, ...gestorIds]));

  const { data: operacoesData, error: operacoesError } = await supabase
    .from("operacoes")
    .select(
      "id, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual"
    )
    .in("user_id", ownerIds)
    .eq("mes", mes)
    .eq("ano", ano);

  if (operacoesError) {
    throw new Error(`Erro ao carregar operações: ${operacoesError.message}`);
  }

  const operacoes = (operacoesData as Operacao[]) || [];
  const operacaoIds = operacoes.map((item) => item.id);

  let lancamentos: Lancamento[] = [];
  if (operacaoIds.length > 0) {
    const { data: lancamentosData, error: lancamentosError } = await supabase
      .from("lancamentos")
      .select("operacao_id, facebook, usd")
      .in("operacao_id", operacaoIds);

    if (lancamentosError) {
      throw new Error(`Erro ao carregar lançamentos: ${lancamentosError.message}`);
    }

    lancamentos = (lancamentosData as Lancamento[]) || [];
  }

  const lancamentosPorOperacao = new Map<number, Lancamento[]>();
  for (const lancamento of lancamentos) {
    const list = lancamentosPorOperacao.get(lancamento.operacao_id) ?? [];
    list.push(lancamento);
    lancamentosPorOperacao.set(lancamento.operacao_id, list);
  }

  const resumoPorUserId = new Map<string, UserResumo>();
  for (const userId of ownerIds) {
    resumoPorUserId.set(userId, buildResumoVazio());
  }

  for (const operacao of operacoes) {
    const userId = operacao.user_id;
    if (!userId || !resumoPorUserId.has(userId)) continue;

    const resumoAtual = resumoPorUserId.get(userId) ?? buildResumoVazio();
    const resumoOperacao = calcularOperacao(
      operacao,
      lancamentosPorOperacao.get(operacao.id) ?? []
    );

    resumoAtual.totalOperacoes += 1;
    resumoAtual.receita += resumoOperacao.receita;
    resumoAtual.custo += resumoOperacao.custo;
    resumoAtual.lucro += resumoOperacao.lucro;
    resumoPorUserId.set(userId, resumoAtual);
  }

  for (const resumo of resumoPorUserId.values()) {
    resumo.roi = resumo.custo > 0 ? (resumo.lucro / resumo.custo) * 100 : 0;
  }

  const adminsCards: OwnerAdminCard[] = [];
  let receitaGlobal = 0;
  let custoGlobal = 0;
  let lucroGlobal = 0;

  for (const admin of admins) {
    const proprioResumo = resumoPorUserId.get(admin.id) ?? buildResumoVazio();
    const gestoresDoAdmin = vinculos
      .filter((v) => v.admin_user_id === admin.id)
      .map((v) => v.gestor_user_id)
      .filter((id): id is string => Boolean(id));

    let equipeOperacoes = 0;
    let equipeReceita = 0;
    let equipeCusto = 0;
    let equipeLucro = 0;
    let gestoresNegativos = 0;
    let gestoresSemOperacao = 0;

    for (const gestorId of gestoresDoAdmin) {
      const resumoGestor = resumoPorUserId.get(gestorId) ?? buildResumoVazio();
      equipeOperacoes += resumoGestor.totalOperacoes;
      equipeReceita += resumoGestor.receita;
      equipeCusto += resumoGestor.custo;
      equipeLucro += resumoGestor.lucro;

      if (resumoGestor.lucro < 0) gestoresNegativos += 1;
      if (resumoGestor.totalOperacoes === 0) gestoresSemOperacao += 1;
    }

    const equipeRoi = equipeCusto > 0 ? (equipeLucro / equipeCusto) * 100 : 0;

    const consolidadoReceita = proprioResumo.receita + equipeReceita;
    const consolidadoCusto = proprioResumo.custo + equipeCusto;
    const consolidadoLucro = proprioResumo.lucro + equipeLucro;
    const consolidadoRoi =
      consolidadoCusto > 0 ? (consolidadoLucro / consolidadoCusto) * 100 : 0;

    receitaGlobal += consolidadoReceita;
    custoGlobal += consolidadoCusto;
    lucroGlobal += consolidadoLucro;

    const alertasRapidos: string[] = [];
    if (gestoresNegativos > 0) {
      alertasRapidos.push(`${gestoresNegativos} gestor(es) em prejuízo no período.`);
    }
    if (gestoresSemOperacao > 0) {
      alertasRapidos.push(`${gestoresSemOperacao} gestor(es) sem operação no período.`);
    }
    if (equipeRoi < 30) {
      alertasRapidos.push("ROI da equipe abaixo de 30%.");
    }
    if (proprioResumo.lucro < 0) {
      alertasRapidos.push("Operação própria do admin está negativa.");
    }
    if (alertasRapidos.length === 0) {
      alertasRapidos.push("Célula está estável no período.");
    }

    adminsCards.push({
      adminId: admin.id,
      nome: labelAdmin(admin),
      statusSaude: calcularSaude({
        lucro: consolidadoLucro,
        roi: consolidadoRoi,
      }, {
        lucro: proprioResumo.lucro,
      }, {
        totalGestoresAtivos: gestoresDoAdmin.length,
        gestoresNegativos,
        gestoresSemOperacao,
      }),
      proprio: {
        totalOperacoes: proprioResumo.totalOperacoes,
        receita: proprioResumo.receita,
        lucro: proprioResumo.lucro,
        roi: proprioResumo.roi,
      },
      equipe: {
        totalGestoresAtivos: gestoresDoAdmin.length,
        totalOperacoes: equipeOperacoes,
        receita: equipeReceita,
        lucro: equipeLucro,
        roi: equipeRoi,
        gestoresNegativos,
        gestoresSemOperacao,
      },
      consolidado: {
        receita: consolidadoReceita,
        lucro: consolidadoLucro,
        roi: consolidadoRoi,
      },
      alertasRapidos,
    });
  }

  adminsCards.sort((a, b) => b.consolidado.lucro - a.consolidado.lucro);

  const debugData = {
    totalAdminsEncontrados: admins.length,
    adminIdsEncontrados: adminIds,
    totalVinculosAtivosEncontrados: vinculos.length,
    totalGestoresEncontrados: gestorIds.length,
    gestorIdsEncontrados: gestorIds,
    totalOperacoesNoPeriodo: operacoes.length,
  };

  if (debug) {
    console.log("[owner-dashboard-debug]", debugData);
  }

  return {
    resumoGlobal: {
      receitaTotalPlataforma: receitaGlobal,
      lucroTotalPlataforma: lucroGlobal,
      roiGlobal: custoGlobal > 0 ? (lucroGlobal / custoGlobal) * 100 : 0,
      totalAdminsAtivos: admins.length,
    },
    admins: adminsCards,
    ...(debug ? { debug: debugData } : {}),
  };
}
