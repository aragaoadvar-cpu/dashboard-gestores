import { calcularDeducaoLiquidaDespesaExtra } from "@/lib/comissao/calcularDeducaoLiquidaDespesaExtra";
import { calcularResumoDashboardOperacao } from "@/lib/dashboard/calcularResumoDashboardOperacao";

export type AuxiliarComissaoAtiva = {
  id: string;
  convidador_user_id?: string | null;
  auxiliar_user_id: string;
  percentual_comissao: number | null;
  percentual_desconto: number | null;
  total_despesas_extras?: number | null;
};

export type ComissaoAuxiliarCalculada = {
  auxiliarUserId: string;
  percentualComissao: number;
  percentualDesconto: number;
  comissaoFinal: number;
};

export type TotalComissoesAuxiliaresResultado = {
  totalComissoesAuxiliares: number;
  comissoesPorAuxiliar: ComissaoAuxiliarCalculada[];
};

type OperacaoConvidadorBase = {
  id: number;
  user_id: string | null;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

type LancamentoConvidadorBase = {
  operacao_id: number;
  facebook: number | null;
  usd: number | null;
};

type DespesaConvidadorBase = {
  user_id: string | null;
  valor: number | null;
  percentual_desconto: number | null;
};

function toNumber(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calcularComissaoAuxiliarFinal(
  baseComissao: number,
  percentualComissao: number | null | undefined,
  percentualDesconto: number | null | undefined,
  totalDespesasExtrasBrutas: number | null | undefined
) {
  const baseComissaoNormalizada = toNumber(baseComissao);
  const percentualComissaoNormalizado = toNumber(percentualComissao);
  const percentualDescontoNormalizado = toNumber(percentualDesconto);
  const comissaoBruta = baseComissaoNormalizada * (percentualComissaoNormalizado / 100);
  const descontoComissao = comissaoBruta * (percentualDescontoNormalizado / 100);
  const totalDespesasExtrasLiquidas = calcularDeducaoLiquidaDespesaExtra(
    totalDespesasExtrasBrutas,
    percentualComissaoNormalizado,
    percentualDescontoNormalizado
  );

  return comissaoBruta - descontoComissao - totalDespesasExtrasLiquidas;
}

export function calcularBaseComissaoAuxiliarConvidador(
  convidadorUserId: string,
  operacoes: OperacaoConvidadorBase[],
  lancamentos: LancamentoConvidadorBase[],
  despesas: DespesaConvidadorBase[]
) {
  const operacoesConvidador = operacoes.filter((operacao) => operacao.user_id === convidadorUserId);

  const repasseTotalBruto = operacoesConvidador.reduce((acc, operacao) => {
    const lancamentosOperacao = lancamentos.filter(
      (lancamento) => lancamento.operacao_id === operacao.id
    );
    const resumoOperacao = calcularResumoDashboardOperacao(operacao, lancamentosOperacao);
    return acc + resumoOperacao.repasse;
  }, 0);

  const descontoDespesas = despesas
    .filter((despesa) => despesa.user_id === convidadorUserId)
    .reduce(
      (acc, despesa) =>
        acc + toNumber(despesa.valor) * (toNumber(despesa.percentual_desconto) / 100),
      0
    );

  return repasseTotalBruto - descontoDespesas;
}

export function calcularTotalComissoesAuxiliares(
  repasseBase: number,
  comissoes: AuxiliarComissaoAtiva[]
): TotalComissoesAuxiliaresResultado {
  let totalComissoesAuxiliares = 0;
  const comissoesPorAuxiliar: ComissaoAuxiliarCalculada[] = [];

  for (const comissao of comissoes) {
    const percentualComissao = toNumber(comissao.percentual_comissao);
    const percentualDesconto = toNumber(comissao.percentual_desconto);
    const comissaoFinal = calcularComissaoAuxiliarFinal(
      repasseBase,
      percentualComissao,
      percentualDesconto,
      comissao.total_despesas_extras,
    );

    totalComissoesAuxiliares += comissaoFinal;
    comissoesPorAuxiliar.push({
      auxiliarUserId: comissao.auxiliar_user_id,
      percentualComissao,
      percentualDesconto,
      comissaoFinal,
    });
  }

  return {
    totalComissoesAuxiliares,
    comissoesPorAuxiliar,
  };
}
