const PERCENTUAL_REPASSE_PADRAO = 20;
const PERCENTUAL_REPASSE_LIQUIDO = 50;

export type DashboardOperacaoFinanceiraInput = {
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

export type DashboardLancamentoFinanceiroInput = {
  facebook: number | null;
  usd: number | null;
};

export type DashboardAdminGestorTaxasInput = {
  taxa_facebook_admin: number | null;
  taxa_network_admin: number | null;
  taxa_imposto_admin: number | null;
  cotacao_dolar_admin: number | null;
  repasse_percentual_admin: number | null;
};

export type DashboardResumoOperacao = {
  custo: number;
  receita: number;
  lucro: number;
  roi: number;
  repasse: number;
  repasseLiquido: number;
};

function toNumber(value: number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calcularResumoDashboardOperacao(
  operacao: DashboardOperacaoFinanceiraInput,
  lancamentos: DashboardLancamentoFinanceiroInput[],
  repassePercentualOverride: number | null = null
): DashboardResumoOperacao {
  const cotacaoDolar = toNumber(operacao.cotacao_dolar, 5.1);
  const taxaFacebook = toNumber(operacao.taxa_facebook, 13.85);
  const taxaNetwork = toNumber(operacao.taxa_network, 6.5);
  const taxaImposto = toNumber(operacao.taxa_imposto, 7);

  let custo = 0;
  let receita = 0;
  let lucro = 0;

  for (const lancamento of lancamentos) {
    const facebook = toNumber(lancamento.facebook, 0);
    const usd = toNumber(lancamento.usd, 0);

    const real = usd * cotacaoDolar;
    const txFace = facebook * (taxaFacebook / 100);
    const net = real * (taxaNetwork / 100);
    const imp = real * (taxaImposto / 100);
    const custoLinha = facebook + txFace + net + imp;
    const lucroLinha = real - custoLinha;

    custo += custoLinha;
    receita += real;
    lucro += lucroLinha;
  }

  const roi = custo > 0 ? (lucro / custo) * 100 : 0;
  const repassePercentualFinal =
    repassePercentualOverride === null
      ? toNumber(operacao.repasse_percentual, PERCENTUAL_REPASSE_PADRAO)
      : repassePercentualOverride;
  const repasse = lucro * (repassePercentualFinal / 100);
  const repasseLiquido = repasse * (PERCENTUAL_REPASSE_LIQUIDO / 100);

  return {
    custo,
    receita,
    lucro,
    roi,
    repasse,
    repasseLiquido,
  };
}

export function aplicarOverrideAdminNaOperacaoDashboard<
  T extends DashboardOperacaoFinanceiraInput,
>(
  operacao: T,
  override: DashboardAdminGestorTaxasInput | null
): T {
  if (!override) return operacao;

  return {
    ...operacao,
    cotacao_dolar:
      override.cotacao_dolar_admin === null
        ? operacao.cotacao_dolar
        : override.cotacao_dolar_admin,
    taxa_facebook:
      override.taxa_facebook_admin === null
        ? operacao.taxa_facebook
        : override.taxa_facebook_admin,
    taxa_network:
      override.taxa_network_admin === null
        ? operacao.taxa_network
        : override.taxa_network_admin,
    taxa_imposto:
      override.taxa_imposto_admin === null
        ? operacao.taxa_imposto
        : override.taxa_imposto_admin,
  };
}

export function getRepassePercentualDashboardComOverride(
  operacao: DashboardOperacaoFinanceiraInput,
  override: DashboardAdminGestorTaxasInput | null
): number | null {
  if (!override || override.repasse_percentual_admin === null) {
    return toNumber(operacao.repasse_percentual, PERCENTUAL_REPASSE_PADRAO);
  }

  return toNumber(override.repasse_percentual_admin, PERCENTUAL_REPASSE_PADRAO);
}
