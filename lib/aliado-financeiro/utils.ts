import type {
  FinanceiroCategoria,
  FinanceiroEscopo,
  FinanceiroLancamentoComRelacoes,
  FinanceiroMetaCategoria,
  FinanceiroRecorrenciaTipo,
} from "./types";

export function getFinanceiroEscopoLabel(escopo: FinanceiroEscopo) {
  return escopo === "empresarial" ? "Empresarial" : "Pessoal";
}

export function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarNumero(valor: number) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatarPercentual(valor: number) {
  return `${formatarNumero(valor)}%`;
}

export function parseNumeroInput(valor: string) {
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

export function formatarDataIso(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function parseDataIso(dataIso: string) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1);
}

export function adicionarMesesNaData(dataIso: string, quantidadeMeses: number) {
  const dataBase = parseDataIso(dataIso);
  const diaBase = dataBase.getDate();
  const anoDestino = dataBase.getFullYear();
  const mesDestino = dataBase.getMonth() + quantidadeMeses;
  const ultimoDiaMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
  return formatarDataIso(new Date(anoDestino, mesDestino, Math.min(diaBase, ultimoDiaMes)));
}

export function obterDiaDoMes(dataIso: string) {
  return parseDataIso(dataIso).getDate();
}

export function dividirValorEmParcelas(valorTotal: number, quantidadeParcelas: number) {
  const totalCentavos = Math.round(valorTotal * 100);
  const parcelaBase = Math.floor(totalCentavos / quantidadeParcelas);
  const resto = totalCentavos - parcelaBase * quantidadeParcelas;

  return Array.from({ length: quantidadeParcelas }, (_, index) => {
    const centavos = parcelaBase + (index < resto ? 1 : 0);
    return centavos / 100;
  });
}

export function getBadgeRecorrencia(
  recorrenciaTipo: FinanceiroRecorrenciaTipo,
  parcelaAtual: number | null,
  parcelaTotal: number | null
) {
  if (recorrenciaTipo === "parcelada" && parcelaAtual && parcelaTotal) {
    return `${parcelaAtual}/${parcelaTotal}`;
  }

  if (recorrenciaTipo === "recorrente") {
    return "Recorrente";
  }

  return "Única";
}

export function getPeriodoMes(mes: number, ano: number) {
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0);
  return { inicio, fim };
}

export function getMesAnterior(mes: number, ano: number) {
  if (mes === 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

export function getMesAnteriorAoAnterior(mes: number, ano: number) {
  const anterior = getMesAnterior(mes, ano);
  return getMesAnterior(anterior.mes, anterior.ano);
}

function normalizarData(dataIso: string) {
  return parseDataIso(dataIso);
}

export function filtrarLancamentosPorMes(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  mes: number,
  ano: number
) {
  return lancamentos.filter((item) => {
    const data = normalizarData(item.data);
    return data.getFullYear() === ano && data.getMonth() + 1 === mes;
  });
}

export function filtrarLancamentosPorIntervalo(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  inicio: Date,
  fim: Date
) {
  return lancamentos.filter((item) => {
    const data = normalizarData(item.data);
    return data >= inicio && data <= fim;
  });
}

export function somarLancamentos(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  tipo?: "receita" | "despesa"
) {
  return lancamentos.reduce((acc, item) => {
    if (tipo && item.tipo !== tipo) return acc;
    return acc + Number(item.valor ?? 0);
  }, 0);
}

export function calcularPercentualGasto(gastos: number, ganhos: number) {
  if (ganhos <= 0) return gastos > 0 ? 100 : 0;
  return (gastos / ganhos) * 100;
}

export function getStatusTermometro(percentual: number) {
  if (percentual <= 50) return { label: "saudável", cor: "bg-emerald-500" };
  if (percentual <= 75) return { label: "atenção", cor: "bg-yellow-400" };
  if (percentual <= 90) return { label: "perigo", cor: "bg-orange-500" };
  return { label: "crítico", cor: "bg-rose-500" };
}

export function calcularDiferencaPercentual(atual: number, anterior: number) {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

export function compararMesAnterior(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  mes: number,
  ano: number
) {
  const anterior = getMesAnterior(mes, ano);
  const anteriorAoAnterior = getMesAnteriorAoAnterior(mes, ano);

  const lancMesAnterior = filtrarLancamentosPorMes(lancamentos, anterior.mes, anterior.ano);
  const lancMesAnteriorAoAnterior = filtrarLancamentosPorMes(
    lancamentos,
    anteriorAoAnterior.mes,
    anteriorAoAnterior.ano
  );

  const totalAnterior = somarLancamentos(lancMesAnterior, "despesa");
  const totalBase = somarLancamentos(lancMesAnteriorAoAnterior, "despesa");

  return {
    mesComparado: anterior,
    mesBase: anteriorAoAnterior,
    totalAnterior,
    totalBase,
    diferenca: totalAnterior - totalBase,
    percentual: calcularDiferencaPercentual(totalAnterior, totalBase),
  };
}

export function compararPeriodoParcial(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  mes: number,
  ano: number,
  dataReferencia = new Date()
) {
  const diaAtual = dataReferencia.getDate();
  const inicioAtual = new Date(ano, mes - 1, 1);
  const fimAtual = new Date(ano, mes - 1, diaAtual);
  const anterior = getMesAnterior(mes, ano);
  const ultimoDiaMesAnterior = new Date(anterior.ano, anterior.mes, 0).getDate();
  const fimAnterior = new Date(anterior.ano, anterior.mes - 1, Math.min(diaAtual, ultimoDiaMesAnterior));
  const inicioAnterior = new Date(anterior.ano, anterior.mes - 1, 1);

  const atual = somarLancamentos(
    filtrarLancamentosPorIntervalo(lancamentos, inicioAtual, fimAtual),
    "despesa"
  );
  const comparativo = somarLancamentos(
    filtrarLancamentosPorIntervalo(lancamentos, inicioAnterior, fimAnterior),
    "despesa"
  );

  return {
    atual,
    comparativo,
    diferenca: atual - comparativo,
    percentual: calcularDiferencaPercentual(atual, comparativo),
  };
}

export function consolidarCategoriasMes(
  lancamentos: FinanceiroLancamentoComRelacoes[],
  categorias: FinanceiroCategoria[],
  metas: FinanceiroMetaCategoria[],
  mes: number,
  ano: number,
  dataReferencia = new Date()
) {
  const despesasMes = filtrarLancamentosPorMes(lancamentos, mes, ano).filter(
    (item) => item.tipo === "despesa"
  );
  const parcial = compararPeriodoParcial(lancamentos, mes, ano, dataReferencia);
  const anterior = getMesAnterior(mes, ano);
  const despesasMesAnterior = filtrarLancamentosPorMes(lancamentos, anterior.mes, anterior.ano).filter(
    (item) => item.tipo === "despesa"
  );
  const mapaCategorias = new Map<string, FinanceiroCategoria>();

  for (const categoria of categorias) {
    if (categoria.tipo !== "despesa") continue;
    mapaCategorias.set(categoria.id, categoria);
  }

  for (const item of despesasMes) {
    if (!item.categoria_id) continue;
    if (mapaCategorias.has(item.categoria_id)) continue;
    if (!item.categoria) continue;

    mapaCategorias.set(item.categoria_id, {
      id: item.categoria.id,
      user_id: item.user_id,
      nome: item.categoria.nome,
      tipo: item.categoria.tipo,
      escopo: item.escopo,
      cor: item.categoria.cor ?? null,
      icone: null,
      created_at: item.created_at,
    });
  }

  return Array.from(mapaCategorias.values())
    .map((categoria) => {
      const totalAtual = despesasMes
        .filter((item) => item.categoria_id === categoria.id)
        .reduce((acc, item) => acc + Number(item.valor), 0);
      const totalAnterior = despesasMesAnterior
        .filter((item) => item.categoria_id === categoria.id)
        .reduce((acc, item) => acc + Number(item.valor), 0);
      const meta = metas.find((item) => item.categoria_id === categoria.id && item.mes === mes && item.ano === ano);
      const referenciaStatus =
        meta?.limite_valor && meta.limite_valor > 0 ? (totalAtual / meta.limite_valor) * 100 : parcial.atual > 0 ? (totalAtual / parcial.atual) * 100 : 0;

      let status = "controlado";
      if (referenciaStatus > 55) status = "crítico";
      else if (referenciaStatus > 35) status = "alto";
      else if (referenciaStatus > 20) status = "atenção";

      return {
        categoria,
        totalAtual,
        totalAnterior,
        diferenca: totalAtual - totalAnterior,
        percentual: calcularDiferencaPercentual(totalAtual, totalAnterior),
        meta: meta?.limite_valor ?? null,
        status,
      };
    })
    .filter((item) => item.totalAtual > 0)
    .sort((a, b) => b.totalAtual - a.totalAtual);
}

export function gerarAlertasFinanceiros(input: {
  ganhosMes: number;
  gastosMes: number;
  saldoMes: number;
  percentualGasto: number;
  comparativoParcial: { diferenca: number; percentual: number };
  categorias: Array<{
    categoria: FinanceiroCategoria;
    percentual: number;
    totalAtual: number;
    status: string;
  }>;
}) {
  const alertas: string[] = [];

  if (input.comparativoParcial.diferenca > 0) {
    alertas.push(
      `Você está gastando ${formatarNumero(input.comparativoParcial.percentual)}% a mais no mesmo período do mês passado.`
    );
  }

  if (input.percentualGasto > 90) {
    alertas.push("Se continuar nesse ritmo, seus gastos podem ultrapassar seus ganhos antes do fim do mês.");
  } else if (input.saldoMes > 0) {
    alertas.push("Seu saldo do mês está positivo. Continue controlando os gastos variáveis.");
  }

  const categoriaCritica = input.categorias.find((item) => item.status === "crítico");
  if (categoriaCritica) {
    alertas.push(
      `${categoriaCritica.categoria.nome} está acima do padrão e merece revisão imediata.`
    );
  }

  const categoriaAlta = input.categorias.find((item) => item.percentual > 20);
  if (categoriaAlta) {
    alertas.push(
      `${categoriaAlta.categoria.nome} concentra ${formatarNumero(categoriaAlta.percentual)}% dos seus gastos do mês.`
    );
  }

  if (alertas.length === 0) {
    alertas.push("Seu comportamento financeiro está estável neste período.");
  }

  return alertas.slice(0, 4);
}
