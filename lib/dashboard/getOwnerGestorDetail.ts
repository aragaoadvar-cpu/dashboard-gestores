import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSaudeStatus, OwnerGestorDetailData, OwnerGestorOperationItem } from "./types";

type Operacao = {
  id: number;
  nome: string | null;
  user_id: string | null;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
};

type Lancamento = {
  operacao_id: number;
  facebook: number | null;
  usd: number | null;
};

const DEFAULT_COTACAO = 5.1;
const DEFAULT_TAXA_FACEBOOK = 13.85;
const DEFAULT_TAXA_NETWORK = 6.5;
const DEFAULT_TAXA_IMPOSTO = 7;

function toNumber(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value);
}

function calcularSaude(totalOperacoes: number, lucro: number, roi: number): AdminSaudeStatus {
  if (lucro < 0 || roi < 0) return "Crítico";
  if (totalOperacoes === 0 || roi < 30) return "Atenção";
  return "Saudável";
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

  const roi = custo > 0 ? (lucro / custo) * 100 : 0;
  return { receita, custo, lucro, roi };
}

export async function getOwnerGestorDetail({
  supabase,
  gestorId,
  mes,
  ano,
}: {
  supabase: SupabaseClient;
  gestorId: string;
  mes: number;
  ano: number;
}): Promise<OwnerGestorDetailData | null> {
  const { data: gestorData, error: gestorError } = await supabase
    .from("profiles")
    .select("id, nome, role")
    .eq("id", gestorId)
    .eq("role", "gestor")
    .maybeSingle();

  if (gestorError) {
    throw new Error(`Erro ao carregar gestor: ${gestorError.message}`);
  }

  if (!gestorData) return null;

  const { data: vinculoData, error: vinculoError } = await supabase
    .from("admin_gestores")
    .select("admin_user_id")
    .eq("gestor_user_id", gestorId)
    .eq("status", "ativo")
    .maybeSingle();

  if (vinculoError) {
    throw new Error(`Erro ao carregar vínculo do gestor: ${vinculoError.message}`);
  }

  let adminId: string | null = vinculoData?.admin_user_id ?? null;
  let adminNome = "Sem admin responsável ativo";

  if (adminId) {
    const { data: adminPerfil, error: adminPerfilError } = await supabase
      .from("profiles")
      .select("id, nome, role")
      .eq("id", adminId)
      .eq("role", "admin")
      .maybeSingle();

    if (adminPerfilError) {
      throw new Error(`Erro ao carregar perfil do admin responsável: ${adminPerfilError.message}`);
    }

    if (!adminPerfil) {
      adminId = null;
    } else {
      adminNome = adminPerfil.nome?.trim() || "Admin sem identificação";
    }
  }

  const { data: operacoesData, error: operacoesError } = await supabase
    .from("operacoes")
    .select("id, nome, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto")
    .eq("user_id", gestorId)
    .eq("mes", mes)
    .eq("ano", ano)
    .order("id", { ascending: false });

  if (operacoesError) {
    throw new Error(`Erro ao carregar operações do gestor: ${operacoesError.message}`);
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

  let totalReceita = 0;
  let totalCusto = 0;
  let totalLucro = 0;
  let operacoesEmPrejuizo = 0;
  let operacoesRoiBaixo = 0;

  const operacoesResumo: OwnerGestorOperationItem[] = operacoes.map((operacao) => {
    const resumo = calcularOperacao(operacao, lancamentosPorOperacao.get(operacao.id) ?? []);
    totalReceita += resumo.receita;
    totalCusto += resumo.custo;
    totalLucro += resumo.lucro;
    if (resumo.lucro < 0) operacoesEmPrejuizo += 1;
    if (resumo.roi < 30) operacoesRoiBaixo += 1;

    return {
      operacaoId: operacao.id,
      nomeOperacao: operacao.nome?.trim() || `Operação #${operacao.id}`,
      receita: resumo.receita,
      custo: resumo.custo,
      lucro: resumo.lucro,
      roi: resumo.roi,
    };
  });

  const roiTotal = totalCusto > 0 ? (totalLucro / totalCusto) * 100 : 0;
  const statusSaude = calcularSaude(operacoesResumo.length, totalLucro, roiTotal);

  const alertasRapidos: string[] = [];
  if (operacoesResumo.length === 0) {
    alertasRapidos.push("Nenhuma operação no período.");
  }
  if (operacoesEmPrejuizo > 0) {
    alertasRapidos.push(`${operacoesEmPrejuizo} operação(ões) com prejuízo.`);
  }
  if (operacoesRoiBaixo > 0) {
    alertasRapidos.push(`${operacoesRoiBaixo} operação(ões) com ROI abaixo de 30%.`);
  }
  if (alertasRapidos.length === 0) {
    alertasRapidos.push("Gestor está estável no período.");
  }

  return {
    gestorId,
    gestorNome: gestorData.nome?.trim() || "Gestor sem identificação",
    adminResponsavel: {
      adminId,
      adminNome,
    },
    periodo: { mes, ano },
    statusSaude,
    totais: {
      totalOperacoes: operacoesResumo.length,
      receita: totalReceita,
      custo: totalCusto,
      lucro: totalLucro,
      roi: roiTotal,
    },
    operacoes: operacoesResumo,
    alertasRapidos,
  };
}
