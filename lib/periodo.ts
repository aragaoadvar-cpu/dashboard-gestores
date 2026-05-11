export const MESES = [
  { valor: 1, nome: "Janeiro", label: "01" },
  { valor: 2, nome: "Fevereiro", label: "02" },
  { valor: 3, nome: "Março", label: "03" },
  { valor: 4, nome: "Abril", label: "04" },
  { valor: 5, nome: "Maio", label: "05" },
  { valor: 6, nome: "Junho", label: "06" },
  { valor: 7, nome: "Julho", label: "07" },
  { valor: 8, nome: "Agosto", label: "08" },
  { valor: 9, nome: "Setembro", label: "09" },
  { valor: 10, nome: "Outubro", label: "10" },
  { valor: 11, nome: "Novembro", label: "11" },
  { valor: 12, nome: "Dezembro", label: "12" },
] as const;

export function formatarMesAnoCurto(mes: number, ano: number) {
  const mesInfo = MESES.find((item) => item.valor === mes);
  return `${mesInfo?.label ?? String(mes).padStart(2, "0")}/${ano}`;
}

export function getNomeMes(mes: number) {
  return MESES.find((item) => item.valor === mes)?.nome ?? "";
}

export function listarPeriodosDisponiveis(
  dataReferencia: Date,
  anosAntes = 1,
  anosDepois = 2
) {
  const itens: Array<{ mes: number; ano: number; label: string }> = [];
  const anoBase = dataReferencia.getFullYear();

  for (let ano = anoBase - anosAntes; ano <= anoBase + anosDepois; ano++) {
    for (let mes = 1; mes <= 12; mes++) {
      itens.push({
        mes,
        ano,
        label: formatarMesAnoCurto(mes, ano),
      });
    }
  }

  return itens.sort((a, b) => {
    if (a.ano !== b.ano) return b.ano - a.ano;
    return b.mes - a.mes;
  });
}

export function getDiasNoMes(mes: number, ano: number) {
  return new Date(ano, mes, 0).getDate();
}

export function limitarDiaAoMes(dia: number, mes: number, ano: number) {
  const diaNormalizado = Number.isFinite(dia) ? Math.floor(dia) : 1;
  return Math.min(Math.max(diaNormalizado, 1), getDiasNoMes(mes, ano));
}

export function formatarDiaMesAno(dia: number, mes: number, ano: number) {
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

export function getPartesDaData(data: Date) {
  return {
    dia: data.getDate(),
    mes: data.getMonth() + 1,
    ano: data.getFullYear(),
  };
}

export function isMesAnoValido(mes: number, ano: number) {
  return Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(ano) && ano >= 2000;
}

export function getMesAnoFromSearchParams(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined,
  dataFallback: Date
) {
  const mesFallback = dataFallback.getMonth() + 1;
  const anoFallback = dataFallback.getFullYear();

  if (!searchParams) {
    return { mes: mesFallback, ano: anoFallback };
  }

  const mes = Number(searchParams.get("mes"));
  const ano = Number(searchParams.get("ano"));

  if (!isMesAnoValido(mes, ano)) {
    return { mes: mesFallback, ano: anoFallback };
  }

  return { mes, ano };
}

export type PeriodoQueryParams = {
  mes?: string | number | null;
  ano?: string | number | null;
  modo?: string | null;
  inicio?: string | null;
  fim?: string | null;
};

export function getPeriodoQueryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined
): PeriodoQueryParams {
  if (!searchParams) return {};

  const mes = searchParams.get("mes");
  const ano = searchParams.get("ano");
  const modo = searchParams.get("modo");
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");

  return {
    mes: mes || null,
    ano: ano || null,
    modo: modo || null,
    inicio: inicio || null,
    fim: fim || null,
  };
}

export function buildHrefComPeriodo(
  pathname: string,
  periodo: PeriodoQueryParams,
  extraParams: Record<string, string | number | null | undefined> = {}
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({
    mes: periodo.mes,
    ano: periodo.ano,
    modo: periodo.modo,
    inicio: periodo.inicio,
    fim: periodo.fim,
    ...extraParams,
  })) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
