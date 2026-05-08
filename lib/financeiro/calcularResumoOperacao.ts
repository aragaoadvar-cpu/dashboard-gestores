const DEFAULT_COTACAO_DOLAR = 5.1;
const DEFAULT_TAXA_FACEBOOK = 13.85;
const DEFAULT_TAXA_NETWORK = 6.5;
const DEFAULT_TAXA_IMPOSTO = 7;
const DEFAULT_REPASSE_PERCENTUAL = 20;
const PERCENTUAL_REPASSE_LIQUIDO = 50;

export type OperacaoResumoFinanceiro = {
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

export type LancamentoResumoFinanceiro = {
  facebook: number | null;
  usd: number | null;
  ecpm?: number | null;
};

export type ResumoOperacaoFinanceiro = {
  facebookTotal: number;
  usdTotal: number;
  ecpmMedio: number;
  custoTotal: number;
  receitaTotalReal: number;
  lucroTotal: number;
  roi: number;
  repasseTotal: number;
  repasseLiquidoTotal: number;
};

function toNumber(value: number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calcularResumoOperacao(
  operacao: OperacaoResumoFinanceiro,
  lancamentos: LancamentoResumoFinanceiro[]
): ResumoOperacaoFinanceiro {
  const cotacaoDolar = toNumber(operacao.cotacao_dolar, DEFAULT_COTACAO_DOLAR);
  const taxaFacebook = toNumber(operacao.taxa_facebook, DEFAULT_TAXA_FACEBOOK);
  const taxaNetwork = toNumber(operacao.taxa_network, DEFAULT_TAXA_NETWORK);
  const taxaImposto = toNumber(operacao.taxa_imposto, DEFAULT_TAXA_IMPOSTO);
  const repassePercentual = toNumber(
    operacao.repasse_percentual,
    DEFAULT_REPASSE_PERCENTUAL
  );

  let custoTotal = 0;
  let receitaTotalReal = 0;
  let lucroTotal = 0;
  let repasseTotal = 0;
  let facebookTotal = 0;
  let usdTotal = 0;
  let somaEcpm = 0;
  let totalDiasComEcpm = 0;

  for (const lancamento of lancamentos) {
    const facebook = toNumber(lancamento.facebook, 0);
    const usd = toNumber(lancamento.usd, 0);
    const ecpm = toNumber(lancamento.ecpm, 0);

    const receitaReal = usd * cotacaoDolar;
    const taxaFacebookValor = facebook * (taxaFacebook / 100);
    const taxaNetworkValor = receitaReal * (taxaNetwork / 100);
    const taxaImpostoValor = receitaReal * (taxaImposto / 100);
    const custo = facebook + taxaFacebookValor + taxaNetworkValor + taxaImpostoValor;
    const lucro = receitaReal - custo;
    const repasse = lucro * (repassePercentual / 100);

    facebookTotal += facebook;
    usdTotal += usd;
    custoTotal += custo;
    receitaTotalReal += receitaReal;
    lucroTotal += lucro;
    repasseTotal += repasse;

    if (ecpm > 0) {
      somaEcpm += ecpm;
      totalDiasComEcpm += 1;
    }
  }

  const roi = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;
  const repasseLiquidoTotal = repasseTotal * (PERCENTUAL_REPASSE_LIQUIDO / 100);
  const ecpmMedio = totalDiasComEcpm > 0 ? somaEcpm / totalDiasComEcpm : 0;

  return {
    facebookTotal,
    usdTotal,
    ecpmMedio,
    custoTotal,
    receitaTotalReal,
    lucroTotal,
    roi,
    repasseTotal,
    repasseLiquidoTotal,
  };
}
