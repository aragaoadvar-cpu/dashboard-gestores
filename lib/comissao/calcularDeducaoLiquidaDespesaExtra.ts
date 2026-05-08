function toNumber(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calcularDeducaoLiquidaDespesaExtra(
  valorBrutoDespesa: number | null | undefined,
  percentualComissao: number | null | undefined,
  percentualDesconto: number | null | undefined
) {
  const valorBrutoNormalizado = toNumber(valorBrutoDespesa);
  const percentualComissaoNormalizado = toNumber(percentualComissao);
  const percentualDescontoNormalizado = toNumber(percentualDesconto);

  // O valor salvo em auxiliar_comissao_despesas_extras representa o valor bruto da despesa.
  // No cálculo da comissão, ele é convertido para o impacto líquido proporcional do auxiliar.
  return (
    valorBrutoNormalizado *
    (percentualComissaoNormalizado / 100) *
    (1 - percentualDescontoNormalizado / 100)
  );
}
