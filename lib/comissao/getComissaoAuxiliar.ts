import {
  AuxiliarComissaoAtiva,
  calcularBaseComissaoAuxiliarConvidador,
  calcularTotalComissoesAuxiliares,
} from "@/lib/comissao/calcularTotalComissoesAuxiliares";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type OperacaoConvidador = {
  id: number;
  user_id: string;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

type LancamentoOperacao = {
  operacao_id: number;
  facebook: number | null;
  usd: number | null;
};

type DespesaExtraComissao = {
  valor: number | null;
};

type VinculoAuxiliarAtivo = {
  owner_user_id: string | null;
};

async function getComissaoAuxiliarDataClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient();
}

export type ComissaoAuxiliarResultado = {
  temConfiguracao: boolean;
  comissaoAtual: number | null;
};

function toNumber(valor: number | null | undefined, fallback = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
}

export async function getComissaoAuxiliar(
  userId: string,
  mes: number,
  ano: number
): Promise<ComissaoAuxiliarResultado | null> {
  const supabase = await getComissaoAuxiliarDataClient();

  const { data: vinculoData, error: vinculoError } = await supabase
    .from("auxiliar_vinculos")
    .select("owner_user_id")
    .eq("auxiliar_user_id", userId)
    .eq("status", "ativo")
    .maybeSingle();

  if (vinculoError) {
    throw new Error(`Erro ao carregar vínculo ativo do auxiliar: ${vinculoError.message}`);
  }

  const vinculoAtivo = (vinculoData as VinculoAuxiliarAtivo | null) ?? null;
  if (!vinculoAtivo?.owner_user_id) {
    return {
      temConfiguracao: false,
      comissaoAtual: null,
    };
  }

  const { data: comissoesData, error: comissoesError } = await supabase
    .from("auxiliar_comissoes")
    .select("id, convidador_user_id, auxiliar_user_id, percentual_comissao, percentual_desconto")
    .eq("auxiliar_user_id", userId)
    .eq("convidador_user_id", vinculoAtivo.owner_user_id)
    .eq("ativo", true)
    .eq("mes", mes)
    .eq("ano", ano)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (comissoesError) {
    throw new Error(`Erro ao carregar comissão do auxiliar: ${comissoesError.message}`);
  }

  const comissaoAtiva = ((comissoesData || [])[0] as AuxiliarComissaoAtiva | undefined) ?? null;
  if (!comissaoAtiva) {
    return {
      temConfiguracao: false,
      comissaoAtual: null,
    };
  }

  const convidadorUserId = comissaoAtiva.convidador_user_id;
  if (!convidadorUserId) {
    return {
      temConfiguracao: false,
      comissaoAtual: null,
    };
  }

  const { data: permissoesOperacoesData, error: permissoesOperacoesError } = await supabase
    .from("operacao_auxiliares")
    .select("operacao_id")
    .eq("auxiliar_user_id", userId);

  if (permissoesOperacoesError) {
    throw new Error(
      `Erro ao carregar operações permitidas do auxiliar: ${permissoesOperacoesError.message}`
    );
  }

  const operacaoIdsPermitidas = (
    (permissoesOperacoesData as Array<{ operacao_id: number | null }>) || []
  )
    .map((item) => Number(item.operacao_id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const operacoesPermitidasSet = new Set<number>(operacaoIdsPermitidas);

  const { data: operacoesData, error: operacoesError } = await supabase
    .from("operacoes")
    .select(
      "id, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual"
    )
    .eq("user_id", convidadorUserId)
    .eq("mes", mes)
    .eq("ano", ano);

  if (operacoesError) {
    throw new Error(`Erro ao carregar operações do convidador: ${operacoesError.message}`);
  }

  const operacoes = ((operacoesData || []) as OperacaoConvidador[]).filter((operacao) =>
    operacoesPermitidasSet.has(operacao.id)
  );

  let lancamentos: LancamentoOperacao[] = [];

  if (operacoes.length > 0) {
    const operacaoIds = operacoes.map((operacao) => operacao.id);

    const { data: lancamentosData, error: lancamentosError } = await supabase
      .from("lancamentos")
      .select("operacao_id, facebook, usd")
      .in("operacao_id", operacaoIds);

    if (lancamentosError) {
      throw new Error(`Erro ao carregar lançamentos do convidador: ${lancamentosError.message}`);
    }

    lancamentos = (lancamentosData || []) as LancamentoOperacao[];
  }

  const { data: despesasData, error: despesasError } = await supabase
    .from("despesas")
    .select("user_id, valor, percentual_desconto")
    .eq("user_id", convidadorUserId)
    .eq("mes", mes)
    .eq("ano", ano);

  if (despesasError) {
    throw new Error(`Erro ao carregar despesas do convidador: ${despesasError.message}`);
  }

  const baseComissao = calcularBaseComissaoAuxiliarConvidador(
    convidadorUserId,
    operacoes,
    lancamentos,
    ((despesasData || []) as Array<{
      user_id: string;
      valor: number | null;
      percentual_desconto: number | null;
    }>) || []
  );

  const { data: despesasExtrasData, error: despesasExtrasError } = await supabase
    .from("auxiliar_comissao_despesas_extras")
    .select("valor")
    .eq("auxiliar_comissao_id", comissaoAtiva.id)
    .eq("mes", mes)
    .eq("ano", ano);

  if (despesasExtrasError) {
    throw new Error(
      `Erro ao carregar despesas extras da comissão do auxiliar: ${despesasExtrasError.message}`
    );
  }

  const resultado = calcularTotalComissoesAuxiliares(
    baseComissao,
    [
      {
        ...comissaoAtiva,
        total_despesas_extras: ((despesasExtrasData || []) as DespesaExtraComissao[]).reduce(
          (acc, despesa) => acc + toNumber(despesa.valor),
          0
        ),
      },
    ]
  );

  const comissaoIndividual = resultado.comissoesPorAuxiliar.find(
    (item) => item.auxiliarUserId === userId
  );

  if (!comissaoIndividual) {
    return {
      temConfiguracao: true,
      comissaoAtual: 0,
    };
  }

  return {
    temConfiguracao: true,
    comissaoAtual: comissaoIndividual.comissaoFinal,
  };
}
