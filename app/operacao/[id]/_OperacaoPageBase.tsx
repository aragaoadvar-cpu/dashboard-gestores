"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type Operacao = {
  id: number;
  nome: string;
  mes: number;
  ano: number;
  user_id: string | null;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

type LinhaDia = {
  diaNumero: number;
  diaSemana: string;
  dataFormatada: string;
  face: string;
  usd: string;
  ecpm: string;
};

type LancamentoBanco = {
  id: number;
  operacao_id: number;
  dia: number;
  facebook: number | null;
  usd: number | null;
  ecpm: number | null;
};

type LinhaOriginal = {
  face: string;
  usd: string;
  ecpm: string;
};

const MESES = [
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
];

const PERCENTUAL_REPASSE_LIQUIDO = 50;

function parseNumero(valor: string): number {
  if (!valor) return 0;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? 0 : numero;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarInput(valor: number): string {
  if (!valor) return "";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function getCorROI(roi: number): string {
  if (roi < 0) return "text-red-600";
  if (roi <= 30) return "text-yellow-500";
  if (roi <= 60) return "text-blue-600";
  if (roi <= 100) return "text-green-600";
  return "text-green-700";
}

function getCorRepasse(valor: number): string {
  if (valor < 0) return "text-red-600";
  return "text-green-600";
}

function getCorRepasseLiquido(valor: number): string {
  if (valor < 0) return "text-red-600";
  return "text-green-600";
}

function getCorBarraRoi(roi: number): string {
  if (roi < 0) return "rgba(185,28,28,0.94)";
  if (roi < 10) return "rgba(220,38,38,0.92)";
  if (roi <= 30) return "rgba(248,113,113,0.92)";
  if (roi <= 49) return "rgba(234,179,8,0.92)";
  return "rgba(34,197,94,0.92)";
}

function getCorBarraUsd(usd: number): string {
  if (usd < 0) return "rgba(185,28,28,0.9)";
  return "rgba(14,165,233,0.88)";
}

function criarDiasIniciais(mes: number, ano: number): LinhaDia[] {
  const nomesDias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const quantidadeDiasNoMes = new Date(ano, mes, 0).getDate();

  return Array.from({ length: quantidadeDiasNoMes }, (_, index) => {
    const diaNumero = index + 1;
    const data = new Date(ano, mes - 1, diaNumero);
    const diaSemana = nomesDias[data.getDay()];
    const dia = String(data.getDate()).padStart(2, "0");
    const mesFormatado = String(mes).padStart(2, "0");

    return {
      diaNumero,
      diaSemana,
      dataFormatada: `${dia}/${mesFormatado}`,
      face: "",
      usd: "",
      ecpm: "",
    };
  });
}

export default function OperacaoPage() {
  const params = useParams();
  const operacaoId = Number(params?.id);
  const supabase = createClient();

  const [operacao, setOperacao] = useState<Operacao | null>(null);

  const [linhas, setLinhas] = useState<LinhaDia[]>([]);
  const [linhasOriginais, setLinhasOriginais] = useState<Record<number, LinhaOriginal>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvandoDia, setSalvandoDia] = useState<number | null>(null);
  const [salvandoConfiguracoes, setSalvandoConfiguracoes] = useState(false);

  const [erroTela, setErroTela] = useState("");
  const [toastMensagem, setToastMensagem] = useState("");

  const [cotacaoDolar, setCotacaoDolar] = useState("");
  const [taxaFacebook, setTaxaFacebook] = useState("");
  const [taxaNetwork, setTaxaNetwork] = useState("");
  const [taxaImposto, setTaxaImposto] = useState("");
  const [repassePercentual, setRepassePercentual] = useState("");

  const [configAberta, setConfigAberta] = useState(false);
  const [graficoAberto, setGraficoAberto] = useState(true);
  const [insightsAberto, setInsightsAberto] = useState(true);
  const [indiceHoverGrafico, setIndiceHoverGrafico] = useState<number | null>(null);
  const [linhaAtiva, setLinhaAtiva] = useState<number | null>(null);
  const [operacaoEhGestor, setOperacaoEhGestor] = useState(false);
  const [modoAuxiliar, setModoAuxiliar] = useState(false);

  const faceRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const usdRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const ecpmRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const diasComSaveEmAndamento = useRef<Set<number>>(new Set());

  const percentualRepasse = parseNumero(repassePercentual) || 20;

  useEffect(() => {
    async function carregarOperacaoELancamentos() {
      if (!operacaoId || Number.isNaN(operacaoId)) {
        setErroTela("ID da operação inválido.");
        setCarregando(false);
        return;
      }

      setCarregando(true);
      setErroTela("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErroTela("Usuário não autenticado.");
        setCarregando(false);
        return;
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (perfilError || !perfilData) {
        setErroTela(`Erro ao validar perfil do usuário: ${perfilError?.message ?? "Perfil não encontrado."}`);
        setCarregando(false);
        return;
      }

      const roleAtual =
        perfilData.role === "dono"
          ? "dono"
          : perfilData.role === "admin"
          ? "admin"
          : perfilData.role === "auxiliar"
          ? "auxiliar"
          : "gestor";

      setModoAuxiliar(roleAtual === "auxiliar");

      let operacaoQuery = supabase
        .from("operacoes")
        .select(
          "id, nome, mes, ano, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual"
        )
        .eq("id", operacaoId);

      if (roleAtual === "gestor") {
        operacaoQuery = operacaoQuery.eq("user_id", user.id);
      } else if (roleAtual === "auxiliar") {
        const { data: permissaoData, error: permissaoError } = await supabase
          .from("operacao_auxiliares")
          .select("id")
          .eq("auxiliar_user_id", user.id)
          .eq("operacao_id", operacaoId)
          .maybeSingle();

        if (permissaoError) {
          setErroTela(`Erro ao validar permissão do auxiliar: ${permissaoError.message}`);
          setCarregando(false);
          return;
        }

        if (!permissaoData) {
          setErroTela("Você não tem permissão para acessar esta operação.");
          setCarregando(false);
          return;
        }
      }

      const { data: operacaoData, error: operacaoError } = await operacaoQuery.maybeSingle();

      if (operacaoError) {
        setErroTela(`Erro ao carregar operação: ${operacaoError.message}`);
        setCarregando(false);
        return;
      }

      if (!operacaoData) {
        if (roleAtual === "auxiliar") {
          setErroTela("Você não tem permissão para acessar esta operação.");
        } else {
          setErroTela("Operação não encontrada ou sem permissão de acesso.");
        }
        setCarregando(false);
        return;
      }

      const operacaoAtual = operacaoData as Operacao;

      setOperacao(operacaoAtual);
      setCotacaoDolar(formatarInput(Number(operacaoAtual.cotacao_dolar ?? 5.1)));
      setTaxaFacebook(formatarInput(Number(operacaoAtual.taxa_facebook ?? 13.85)));
      setTaxaNetwork(formatarInput(Number(operacaoAtual.taxa_network ?? 6.5)));
      setTaxaImposto(formatarInput(Number(operacaoAtual.taxa_imposto ?? 7)));
      setRepassePercentual(formatarInput(Number(operacaoAtual.repasse_percentual ?? 20)));

      if (operacaoAtual.user_id) {
        const { data: donoPerfilData, error: donoPerfilError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", operacaoAtual.user_id)
          .maybeSingle();

        if (!donoPerfilError && donoPerfilData?.role === "gestor") {
          setOperacaoEhGestor(true);
        } else {
          setOperacaoEhGestor(false);
        }
      } else {
        setOperacaoEhGestor(false);
      }

      const diasBase = criarDiasIniciais(operacaoAtual.mes, operacaoAtual.ano);

      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from("lancamentos")
        .select("id, operacao_id, dia, facebook, usd, ecpm")
        .eq("operacao_id", operacaoId)
        .order("dia", { ascending: true });

      if (lancamentosError) {
        setErroTela(`Erro ao carregar lançamentos: ${lancamentosError.message}`);
        setLinhas(diasBase);
        setCarregando(false);
        return;
      }

      const lancamentos = (lancamentosData as LancamentoBanco[]) || [];

      const linhasAtualizadas = diasBase.map((linha) => {
        const lancamento = lancamentos.find((item) => item.dia === linha.diaNumero);

        if (!lancamento) return linha;

        return {
          ...linha,
          face: formatarInput(lancamento.facebook ?? 0),
          usd: formatarInput(lancamento.usd ?? 0),
          ecpm: formatarInput(lancamento.ecpm ?? 0),
        };
      });

      const originaisMap: Record<number, LinhaOriginal> = {};
      for (const linha of linhasAtualizadas) {
        originaisMap[linha.diaNumero] = {
          face: linha.face,
          usd: linha.usd,
          ecpm: linha.ecpm,
        };
      }

      setLinhas(linhasAtualizadas);
      setLinhasOriginais(originaisMap);
      setCarregando(false);
    }

    carregarOperacaoELancamentos();
  }, [operacaoId]);

  useEffect(() => {
    if (!toastMensagem) return;

    const timer = window.setTimeout(() => {
      setToastMensagem("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [toastMensagem]);

  function atualizarCampo(diaNumero: number, campo: "face" | "usd" | "ecpm", valor: string) {
    setLinhas((linhasAtuais) =>
      linhasAtuais.map((linha) =>
        linha.diaNumero === diaNumero ? { ...linha, [campo]: valor } : linha
      )
    );
  }

  async function salvarConfiguracoes() {
    if (!operacao) return;
    if (modoAuxiliar) {
      setErroTela("Auxiliar não pode alterar configurações da operação.");
      return;
    }

    const cotacaoNumerica = parseNumero(cotacaoDolar);
    const taxaFacebookNumerica = parseNumero(taxaFacebook);
    const taxaNetworkNumerica = parseNumero(taxaNetwork);
    const taxaImpostoNumerica = parseNumero(taxaImposto);
    const repassePercentualNumerico = parseNumero(repassePercentual);

    if (cotacaoNumerica <= 0) {
      setErroTela("Digite uma cotação do dólar válida.");
      return;
    }

    if (taxaFacebookNumerica < 0 || taxaNetworkNumerica < 0 || taxaImpostoNumerica < 0) {
      setErroTela("As taxas não podem ser negativas.");
      return;
    }

    if (repassePercentualNumerico < 0) {
      setErroTela("O repasse não pode ser negativo.");
      return;
    }

    setSalvandoConfiguracoes(true);
    setErroTela("");

    const { error } = await supabase
      .from("operacoes")
      .update({
        cotacao_dolar: cotacaoNumerica,
        taxa_facebook: taxaFacebookNumerica,
        taxa_network: taxaNetworkNumerica,
        taxa_imposto: taxaImpostoNumerica,
        repasse_percentual: repassePercentualNumerico,
      })
      .eq("id", operacao.id);

    if (error) {
      setErroTela(`Erro ao salvar configurações: ${error.message}`);
      setSalvandoConfiguracoes(false);
      return;
    }

    setOperacao((atual) =>
      atual
        ? {
            ...atual,
            cotacao_dolar: cotacaoNumerica,
            taxa_facebook: taxaFacebookNumerica,
            taxa_network: taxaNetworkNumerica,
            taxa_imposto: taxaImpostoNumerica,
            repasse_percentual: repassePercentualNumerico,
          }
        : atual
    );

    setToastMensagem("Configurações salvas com sucesso.");
    setSalvandoConfiguracoes(false);
    setConfigAberta(false);
  }

  async function salvarLinha(dia: number, facebook: number, usd: number, ecpm: number) {
    if (!operacao) return;
    if (diasComSaveEmAndamento.current.has(dia)) return false;

    diasComSaveEmAndamento.current.add(dia);
    setSalvandoDia(dia);
    setErroTela("");

    const { data: existentes, error: erroBusca } = await supabase
      .from("lancamentos")
      .select("id")
      .eq("operacao_id", operacao.id)
      .eq("dia", dia)
      .limit(1);

    if (erroBusca) {
      setErroTela(`Erro ao buscar lançamento existente: ${erroBusca.message}`);
      diasComSaveEmAndamento.current.delete(dia);
      setSalvandoDia(null);
      return false;
    }

    const registroExistente = existentes?.[0];

    if (registroExistente) {
      const { error: erroUpdate } = await supabase
        .from("lancamentos")
        .update({
          facebook,
          usd,
          ecpm,
        })
        .eq("id", registroExistente.id);

      if (erroUpdate) {
        setErroTela(`Erro ao atualizar lançamento: ${erroUpdate.message}`);
        diasComSaveEmAndamento.current.delete(dia);
        setSalvandoDia(null);
        return false;
      }
    } else {
      const { error: erroInsert } = await supabase.from("lancamentos").insert([
        {
          operacao_id: operacao.id,
          dia,
          facebook,
          usd,
          ecpm,
        },
      ]);

      if (erroInsert) {
        setErroTela(`Erro ao inserir lançamento: ${erroInsert.message}`);
        diasComSaveEmAndamento.current.delete(dia);
        setSalvandoDia(null);
        return false;
      }
    }

    setLinhasOriginais((atual) => ({
      ...atual,
      [dia]: {
        face: formatarInput(facebook),
        usd: formatarInput(usd),
        ecpm: formatarInput(ecpm),
      },
    }));

    diasComSaveEmAndamento.current.delete(dia);
    setSalvandoDia(null);
    return true;
  }

  async function salvarLinhaPorDia(dia: number) {
    const linha = linhas.find((item) => item.diaNumero === dia);
    if (!linha) return false;

    const original = linhasOriginais[dia] ?? { face: "", usd: "", ecpm: "" };

    const faceAtualNormalizado = formatarInput(parseNumero(linha.face));
    const usdAtualNormalizado = formatarInput(parseNumero(linha.usd));
    const ecpmAtualNormalizado = formatarInput(parseNumero(linha.ecpm));
    const faceOriginalNormalizado = formatarInput(parseNumero(original.face));
    const usdOriginalNormalizado = formatarInput(parseNumero(original.usd));
    const ecpmOriginalNormalizado = formatarInput(parseNumero(original.ecpm));

    const houveAlteracao =
      faceAtualNormalizado !== faceOriginalNormalizado ||
      usdAtualNormalizado !== usdOriginalNormalizado ||
      ecpmAtualNormalizado !== ecpmOriginalNormalizado;

    if (!houveAlteracao) {
      return false;
    }

    const facebookAtual = parseNumero(linha.face);
    const usdAtual = parseNumero(linha.usd);
    const ecpmAtual = parseNumero(linha.ecpm);

    return await salvarLinha(dia, facebookAtual, usdAtual, ecpmAtual);
  }

  function focarFace(dia: number) {
    faceRefs.current[dia]?.focus();
  }

  function focarUsd(dia: number) {
    usdRefs.current[dia]?.focus();
  }

  function focarEcpm(dia: number) {
    ecpmRefs.current[dia]?.focus();
  }

  function tratarBlurCampo(dia: number) {
    void salvarLinhaPorDia(dia);
  }

  async function tratarTeclaCampo(
    e: React.KeyboardEvent<HTMLInputElement>,
    dia: number,
    campo: "face" | "usd" | "ecpm"
  ) {
    if (e.key === "Enter") {
      e.preventDefault();

      if (campo === "face") {
        focarUsd(dia);
        return;
      }

      if (campo === "usd") {
        focarEcpm(dia);
        return;
      }

      await salvarLinhaPorDia(dia);
      focarFace(dia + 1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();

      if (campo === "face") focarFace(dia + 1);
      if (campo === "usd") focarUsd(dia + 1);
      if (campo === "ecpm") focarEcpm(dia + 1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();

      if (campo === "face") focarFace(dia - 1);
      if (campo === "usd") focarUsd(dia - 1);
      if (campo === "ecpm") focarEcpm(dia - 1);
      return;
    }

    if (e.key === "ArrowRight" && campo === "face") {
      const input = e.currentTarget;
      const cursorNoFim =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

      if (cursorNoFim) {
        e.preventDefault();
        focarUsd(dia);
      }
    }

    if (e.key === "ArrowRight" && campo === "usd") {
      const input = e.currentTarget;
      const cursorNoFim =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

      if (cursorNoFim) {
        e.preventDefault();
        focarEcpm(dia);
      }
    }

    if (e.key === "ArrowLeft" && campo === "usd") {
      const input = e.currentTarget;
      const cursorNoInicio = input.selectionStart === 0 && input.selectionEnd === 0;

      if (cursorNoInicio) {
        e.preventDefault();
        focarFace(dia);
      }
    }

    if (e.key === "ArrowLeft" && campo === "ecpm") {
      const input = e.currentTarget;
      const cursorNoInicio = input.selectionStart === 0 && input.selectionEnd === 0;

      if (cursorNoInicio) {
        e.preventDefault();
        focarUsd(dia);
      }
    }
  }

  const resumo = useMemo(() => {
    const dolar = parseNumero(cotacaoDolar);
    const taxaFace = parseNumero(taxaFacebook);
    const taxaNet = parseNumero(taxaNetwork);
    const taxaImp = parseNumero(taxaImposto);

    let custoTotal = 0;
    let receitaTotalReal = 0;
    let lucroTotal = 0;
    let repasseTotal = 0;

    for (const linha of linhas) {
      const facebook = parseNumero(linha.face);
      const usd = parseNumero(linha.usd);

      const real = usd * dolar;
      const txFace = facebook * (taxaFace / 100);
      const net = real * (taxaNet / 100);
      const imp = real * (taxaImp / 100);
      const custo = facebook + txFace + net + imp;
      const lucro = real - custo;
      const rep = lucro * (percentualRepasse / 100);

      custoTotal += custo;
      receitaTotalReal += real;
      lucroTotal += lucro;
      repasseTotal += rep;
    }

    const roi = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;
    const repasseLiquidoTotal = repasseTotal * (PERCENTUAL_REPASSE_LIQUIDO / 100);

    return {
      custoTotal,
      receitaTotalReal,
      lucroTotal,
      roi,
      repasseTotal,
      repasseLiquidoTotal,
    };
  }, [linhas, cotacaoDolar, taxaFacebook, taxaNetwork, taxaImposto, percentualRepasse]);

  const insightsOperacao = useMemo(() => {
    const nomesDiasSemana: Record<string, string> = {
      Dom: "Domingo",
      Seg: "Segunda-feira",
      Ter: "Terça-feira",
      Qua: "Quarta-feira",
      Qui: "Quinta-feira",
      Sex: "Sexta-feira",
      Sáb: "Sábado",
    };
    const labelsSemana = ["1ª semana", "2ª semana", "3ª semana", "4ª semana"] as const;

    const diasComEcpm = linhas
      .map((linha) => ({
        diaNumero: linha.diaNumero,
        dataFormatada: linha.dataFormatada,
        diaSemana: linha.diaSemana,
        ecpm: parseNumero(linha.ecpm),
      }))
      .filter((linha) => linha.ecpm > 0);

    if (diasComEcpm.length === 0) {
      return {
        mediaEcpm: 0,
        melhorDia: null as null | { dataFormatada: string; ecpm: number },
        piorDia: null as null | { dataFormatada: string; ecpm: number },
        top5DiasEcpm: [] as Array<{ dataFormatada: string; ecpm: number }>,
        melhoresDiasSemana: [] as Array<{ diaSemana: string; mediaEcpm: number }>,
        pioresDiasSemana: [] as Array<{ diaSemana: string; mediaEcpm: number }>,
        ecpmAtualVsMedia: null as null | {
          dataFormatada: string;
          ecpmAtual: number;
          percentualVsMediaMes: number;
        },
        melhorSemanaDoMes: null as null | {
          semanaIndex: number;
          semanaLabel: string;
          mediaEcpm: number;
          percentualVsMediaMes: number;
        },
        totalDiasValidos: 0,
      };
    }

    const somaEcpm = diasComEcpm.reduce((acumulado, linha) => acumulado + linha.ecpm, 0);
    const mediaEcpm = somaEcpm / diasComEcpm.length;

    const melhorDia = diasComEcpm.reduce((melhor, linha) =>
      linha.ecpm > melhor.ecpm ? linha : melhor
    );
    const piorDia = diasComEcpm.reduce((pior, linha) =>
      linha.ecpm < pior.ecpm ? linha : pior
    );
    const top5DiasEcpm = [...diasComEcpm]
      .sort((a, b) => b.ecpm - a.ecpm)
      .slice(0, 5);
    const acumuladoPorDiaSemana = diasComEcpm.reduce((acumulado, linha) => {
      const chave = linha.diaSemana;
      if (!acumulado[chave]) {
        acumulado[chave] = { soma: 0, total: 0 };
      }
      acumulado[chave].soma += linha.ecpm;
      acumulado[chave].total += 1;
      return acumulado;
    }, {} as Record<string, { soma: number; total: number }>);

    const melhoresDiasSemana = Object.entries(acumuladoPorDiaSemana)
      .map(([diaSemanaCurto, valores]) => ({
        diaSemana: nomesDiasSemana[diaSemanaCurto] ?? diaSemanaCurto,
        mediaEcpm: valores.soma / valores.total,
      }))
      .sort((a, b) => b.mediaEcpm - a.mediaEcpm)
      .slice(0, 2);
    const pioresDiasSemana = Object.entries(acumuladoPorDiaSemana)
      .map(([diaSemanaCurto, valores]) => ({
        diaSemana: nomesDiasSemana[diaSemanaCurto] ?? diaSemanaCurto,
        mediaEcpm: valores.soma / valores.total,
      }))
      .sort((a, b) => a.mediaEcpm - b.mediaEcpm)
      .slice(0, 2);
    const ultimoDiaPreenchido = diasComEcpm.reduce((ultimo, atual) =>
      atual.diaNumero > ultimo.diaNumero ? atual : ultimo
    );
    const ecpmAtualVsMedia = {
      dataFormatada: ultimoDiaPreenchido.dataFormatada,
      ecpmAtual: ultimoDiaPreenchido.ecpm,
      percentualVsMediaMes:
        mediaEcpm > 0 ? ((ultimoDiaPreenchido.ecpm - mediaEcpm) / mediaEcpm) * 100 : 0,
    };

    const totalDiasMes = linhas.length;
    const tamanhoSemana = totalDiasMes > 0 ? totalDiasMes / 4 : 0;
    const acumuladoPorSemana = diasComEcpm.reduce((acumulado, linha) => {
      if (tamanhoSemana <= 0) return acumulado;

      const indexBruto = Math.floor((linha.diaNumero - 1) / tamanhoSemana);
      const semanaIndex = Math.min(3, Math.max(0, indexBruto));

      if (!acumulado[semanaIndex]) {
        acumulado[semanaIndex] = { soma: 0, total: 0 };
      }
      acumulado[semanaIndex].soma += linha.ecpm;
      acumulado[semanaIndex].total += 1;

      return acumulado;
    }, {} as Record<number, { soma: number; total: number }>);

    const mediasSemanais = Object.entries(acumuladoPorSemana).map(([semanaIndex, valores]) => ({
      semanaIndex: Number(semanaIndex),
      mediaEcpm: valores.soma / valores.total,
    }));

    const melhorSemana =
      mediasSemanais.length > 0
        ? mediasSemanais.reduce((melhor, atual) =>
            atual.mediaEcpm > melhor.mediaEcpm ? atual : melhor
          )
        : null;

    const melhorSemanaDoMes = melhorSemana
      ? {
          semanaIndex: melhorSemana.semanaIndex,
          semanaLabel: labelsSemana[melhorSemana.semanaIndex] ?? `${melhorSemana.semanaIndex + 1}ª semana`,
          mediaEcpm: melhorSemana.mediaEcpm,
          percentualVsMediaMes:
            mediaEcpm > 0 ? ((melhorSemana.mediaEcpm - mediaEcpm) / mediaEcpm) * 100 : 0,
        }
      : null;

    return {
      mediaEcpm,
      melhorDia,
      piorDia,
      top5DiasEcpm,
      melhoresDiasSemana,
      pioresDiasSemana,
      ecpmAtualVsMedia,
      melhorSemanaDoMes,
      totalDiasValidos: diasComEcpm.length,
    };
  }, [linhas]);

  const nomeMes = operacao
    ? MESES.find((item) => item.valor === operacao.mes)?.nome ?? ""
    : "";

  const graficoDias = useMemo(() => {
    return linhas.map((linha) => {
      const dolar = parseNumero(cotacaoDolar);
      const taxaFace = parseNumero(taxaFacebook);
      const taxaNet = parseNumero(taxaNetwork);
      const taxaImp = parseNumero(taxaImposto);

      const facebook = parseNumero(linha.face);
      const usd = parseNumero(linha.usd);

      const real = usd * dolar;
      const txFace = facebook * (taxaFace / 100);
      const net = real * (taxaNet / 100);
      const imp = real * (taxaImp / 100);
      const custo = facebook + txFace + net + imp;
      const lucro = real - custo;
      const roi = custo > 0 ? (lucro / custo) * 100 : 0;

      return {
        dia: linha.diaNumero,
        usd,
        roi,
      };
    });
  }, [linhas, cotacaoDolar, taxaFacebook, taxaNetwork, taxaImposto]);

  const graficoLayout = useMemo(() => {
    const pontosBase = graficoDias.length === 0 ? [{ dia: 1, usd: 0, roi: 0 }] : graficoDias;
    const totalPontos = pontosBase.length;

    const espacamento = 34;
    const larguraMinima = 760;
    const largura = Math.max(larguraMinima, totalPontos * espacamento + 120);

    const paddingEsquerda = 50;
    const paddingDireita = 54;
    const paddingTopo = 14;
    const paddingBase = 28;

    const alturaPlot = 220;
    const altura = paddingTopo + alturaPlot + paddingBase;
    const larguraPlot = largura - paddingEsquerda - paddingDireita;

    const roiVolumes = pontosBase.map((item) => item.usd * (item.roi / 100));
    const minUsd = Math.min(...pontosBase.map((item) => item.usd), 0);
    const maxUsd = Math.max(...pontosBase.map((item) => item.usd), 0);
    const minRoiVolume = Math.min(...roiVolumes, 0);
    const maxRoiVolume = Math.max(...roiVolumes, 0);

    const escalaMin = Math.min(minUsd, minRoiVolume, 0);
    let escalaMax = Math.max(maxUsd, maxRoiVolume, 1);
    if (escalaMax === escalaMin) {
      escalaMax = escalaMax + 1;
    }

    const amplitudeEscala = escalaMax - escalaMin;
    const yFromValor = (valor: number) =>
      paddingTopo + (1 - (valor - escalaMin) / amplitudeEscala) * alturaPlot;

    const zeroY = yFromValor(0);
    const temEixoZero = escalaMin < 0 && escalaMax > 0;

    const pontos = pontosBase.map((item, index) => {
      const x =
        totalPontos === 1
          ? paddingEsquerda + larguraPlot / 2
          : paddingEsquerda + (index / (totalPontos - 1)) * larguraPlot;
      const yUsd = yFromValor(item.usd);
      const roiVolume = item.usd * (item.roi / 100);
      const yRoi = yFromValor(roiVolume);

      return {
        ...item,
        roiVolume,
        x,
        yUsd,
        yRoi,
      };
    });

    const linhasGrade = Array.from({ length: 5 }, (_, idx) => paddingTopo + (alturaPlot / 4) * idx);

    return {
      largura,
      altura,
      paddingEsquerda,
      paddingDireita,
      paddingTopo,
      paddingBase,
      alturaPlot,
      larguraPlot,
      zeroY,
      escalaMin,
      escalaMax,
      temEixoZero,
      pontos,
      linhasGrade,
      barraLargura: Math.max(4, Math.min(8, Math.floor(larguraPlot / Math.max(totalPontos, 20) * 0.28))),
      barraGap: 2,
    };
  }, [graficoDias]);

  const itemHoverGrafico =
    indiceHoverGrafico !== null ? graficoLayout.pontos[indiceHoverGrafico] ?? null : null;

  if (!carregando && !operacao && erroTela) {
    return (
      <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
        <section className="mx-auto max-w-7xl rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.55)]">
          <Link
            href="/"
            className="inline-flex rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            ← Voltar para o dashboard
          </Link>

          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">
            {erroTela}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href="/"
            className="inline-flex rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-white/10"
          >
            ← Voltar para o dashboard
          </Link>

          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
            OPERAÇÃO ATIVA -{" "}
            <span className="text-slate-100">{operacao?.nome || "CARREGANDO..."}</span> -{" "}
            <span className="text-slate-100">{nomeMes || "..."}</span>
          </div>
        </div>

        <section
          className={`grid gap-3 ${
            modoAuxiliar
              ? "grid-cols-1"
              : `grid-cols-2 lg:grid-cols-3 ${operacaoEhGestor ? "xl:grid-cols-6" : "xl:grid-cols-5"}`
          }`}
        >
          {modoAuxiliar && (
            <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 md:text-sm">ROI</p>
              <p
                className={`mt-2 break-words text-lg font-extrabold md:text-2xl ${getCorROI(
                  resumo.roi
                )}`}
              >
                {formatarNumero(resumo.roi)}%
              </p>
            </div>
          )}

          {!modoAuxiliar && (
            <>
          <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-red-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Custo</p>
            <p className="mt-2 break-words text-lg font-extrabold text-red-600 md:text-2xl">
              R$ {formatarNumero(resumo.custoTotal)}
            </p>
          </div>

          <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-yellow-400 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Receita</p>
            <p className="mt-2 break-words text-lg font-extrabold text-blue-600 md:text-2xl">
              R$ {formatarNumero(resumo.receitaTotalReal)}
            </p>
          </div>

          <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-blue-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Lucro</p>
            <p className="mt-2 break-words text-lg font-extrabold text-green-600 md:text-2xl">
              R$ {formatarNumero(resumo.lucroTotal)}
            </p>
          </div>

          <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">ROI</p>
            <p
              className={`mt-2 break-words text-lg font-extrabold md:text-2xl ${getCorROI(
                resumo.roi
              )}`}
            >
              {formatarNumero(resumo.roi)}%
            </p>
          </div>

          <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Repasse</p>
            <p
              className={`mt-2 break-words text-lg font-extrabold md:text-2xl ${getCorRepasse(
                resumo.repasseTotal
              )}`}
            >
              R$ {formatarNumero(resumo.repasseTotal)}
            </p>
          </div>

          {operacaoEhGestor && (
            <div className="min-w-0 rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 md:text-sm">Repasse Líquido</p>
              <p
                className={`mt-2 break-words text-lg font-extrabold md:text-2xl ${getCorRepasseLiquido(
                  resumo.repasseLiquidoTotal
                )}`}
              >
                R$ {formatarNumero(resumo.repasseLiquidoTotal)}
              </p>
            </div>
          )}
            </>
          )}

        </section>

        <section className="rounded-[28px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <div className="rounded-[24px] border border-white/10 bg-[#0b1222]/80 p-5">
            <div className="flex flex-col gap-5">
              {(!!erroTela || carregando || salvandoDia !== null) && (
                <div className="w-full space-y-2">
                  {carregando && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      Carregando operação...
                    </div>
                  )}

                  {!!erroTela && (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {erroTela}
                    </div>
                  )}

                  {salvandoDia !== null && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      Salvando dia {salvandoDia}...
                    </div>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setGraficoAberto((prev) => !prev)}
                  className="mb-4 flex w-full items-center justify-between rounded-2xl border border-cyan-300/35 bg-[#0b1222]/95 px-4 py-4 text-left shadow-[0_10px_28px_rgba(14,116,144,0.2)]"
                >
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-50 md:text-xl">
                      Evolução diária (USD + ROI proporcional)
                    </h2>
                    <p className="mt-1 text-sm text-slate-200">
                      Barras de USD diário e ROI proporcional ao USD de cada dia.
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-cyan-100">
                    {graficoAberto ? "Fechar" : "Abrir"}
                  </span>
                </button>

                {graficoAberto && (
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px] rounded-2xl border border-slate-700/70 bg-[#0a1222] p-4 shadow-[0_10px_28px_rgba(2,6,23,0.35)]">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                            <span className="h-2.5 w-5 rounded-sm bg-sky-500/85" />
                            USD diário
                          </div>
                          <span className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                            <span className="h-2 w-2 rounded-full bg-red-600" />
                            ROI crítico
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200">
                            <span className="h-2 w-2 rounded-full bg-rose-400" />
                            ROI baixo
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-yellow-300/30 bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold text-yellow-200">
                            <span className="h-2 w-2 rounded-full bg-yellow-400" />
                            Atenção com o ROI
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-green-300/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-200">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Publisher de sucesso
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          Escala compartilhada: {formatarNumero(graficoLayout.escalaMin)} a{" "}
                          {formatarNumero(graficoLayout.escalaMax)}
                        </div>
                      </div>

                      <div
                        className="relative overflow-hidden rounded-xl border border-slate-700 bg-[#0b1528]"
                        style={{ width: `${graficoLayout.largura}px` }}
                        onMouseLeave={() => setIndiceHoverGrafico(null)}
                      >
                        <svg
                          width={graficoLayout.largura}
                          height={graficoLayout.altura}
                          role="img"
                          aria-label="Gráfico diário da operação"
                        >
                          {graficoLayout.linhasGrade.map((y, idx) => (
                            <line
                              key={`grid-${idx}`}
                              x1={graficoLayout.paddingEsquerda}
                              x2={graficoLayout.largura - graficoLayout.paddingDireita}
                              y1={y}
                              y2={y}
                              stroke="rgba(148,163,184,0.24)"
                              strokeWidth="1"
                            />
                          ))}

                          <text
                            x={8}
                            y={10}
                            fontSize={10}
                            fill="#94a3b8"
                            fontWeight={700}
                          >
                            Escala única por volume bruto
                          </text>

                          {graficoLayout.temEixoZero && (
                            <line
                              x1={graficoLayout.paddingEsquerda}
                              x2={graficoLayout.largura - graficoLayout.paddingDireita}
                              y1={graficoLayout.zeroY}
                              y2={graficoLayout.zeroY}
                              stroke="rgba(100,116,139,0.75)"
                              strokeWidth="1.2"
                            />
                          )}

                          {graficoLayout.pontos.map((ponto) => {
                            const deslocamento = graficoLayout.barraLargura / 2 + graficoLayout.barraGap / 2;
                            const xUsd = ponto.x - deslocamento - graficoLayout.barraLargura / 2;
                            const yUsd = Math.min(graficoLayout.zeroY, ponto.yUsd);
                            const alturaUsd = Math.max(Math.abs(ponto.yUsd - graficoLayout.zeroY), 1.5);

                            return (
                              <rect
                                key={`bar-usd-${ponto.dia}`}
                                x={xUsd}
                                y={yUsd}
                                width={graficoLayout.barraLargura}
                                height={alturaUsd}
                                rx={2}
                                fill={getCorBarraUsd(ponto.usd)}
                              />
                            );
                          })}

                          {graficoLayout.pontos.map((ponto) => {
                            const deslocamento = graficoLayout.barraLargura / 2 + graficoLayout.barraGap / 2;
                            const xRoi = ponto.x + deslocamento - graficoLayout.barraLargura / 2;
                            const yRoi = Math.min(graficoLayout.zeroY, ponto.yRoi);
                            const alturaRoi = Math.max(Math.abs(ponto.yRoi - graficoLayout.zeroY), 1.5);

                            return (
                              <rect
                                key={`bar-roi-${ponto.dia}`}
                                x={xRoi}
                                y={yRoi}
                                width={graficoLayout.barraLargura}
                                height={alturaRoi}
                                rx={2}
                                fill={getCorBarraRoi(ponto.roi)}
                              />
                            );
                          })}

                          {graficoLayout.pontos.map((ponto, index) => {
                            const larguraHit = Math.max(18, graficoLayout.larguraPlot / Math.max(graficoLayout.pontos.length, 1));
                            return (
                              <rect
                                key={`hit-${ponto.dia}`}
                                x={ponto.x - larguraHit / 2}
                                y={graficoLayout.paddingTopo}
                                width={larguraHit}
                                height={graficoLayout.alturaPlot}
                                fill="transparent"
                                onMouseEnter={() => setIndiceHoverGrafico(index)}
                              />
                            );
                          })}

                          {graficoLayout.pontos.map((ponto) => (
                            <text
                              key={`day-${ponto.dia}`}
                              x={ponto.x}
                              y={graficoLayout.altura - 8}
                              textAnchor="middle"
                              fontSize={10}
                              fill="#94a3b8"
                              fontWeight={600}
                            >
                              {String(ponto.dia).padStart(2, "0")}
                            </text>
                          ))}

                          <text
                            x={10}
                            y={graficoLayout.paddingTopo + 4}
                            fontSize={10}
                            fill="#94a3b8"
                            fontWeight={600}
                          >
                            {formatarNumero(graficoLayout.escalaMax)}
                          </text>
                          {graficoLayout.temEixoZero && (
                            <text
                              x={18}
                              y={graficoLayout.zeroY + 4}
                              fontSize={10}
                              fill="#94a3b8"
                              fontWeight={600}
                            >
                              0,00
                            </text>
                          )}
                          <text
                            x={10}
                            y={graficoLayout.paddingTopo + graficoLayout.alturaPlot}
                            fontSize={10}
                            fill="#94a3b8"
                            fontWeight={600}
                          >
                            {formatarNumero(graficoLayout.escalaMin)}
                          </text>

                          <text
                            x={graficoLayout.largura - 6}
                            y={graficoLayout.paddingTopo + 4}
                            fontSize={10}
                            fill="#94a3b8"
                            fontWeight={600}
                            textAnchor="end"
                          >
                            {formatarNumero(graficoLayout.escalaMax)}
                          </text>
                          <text
                            x={graficoLayout.largura - 6}
                            y={graficoLayout.paddingTopo + graficoLayout.alturaPlot}
                            fontSize={10}
                            fill="#94a3b8"
                            fontWeight={600}
                            textAnchor="end"
                          >
                            {formatarNumero(graficoLayout.escalaMin)}
                          </text>
                        </svg>

                        {itemHoverGrafico && (
                          <div
                            className="pointer-events-none absolute top-2 rounded-lg border border-slate-600 bg-[#0b1222]/95 px-3 py-2 text-xs shadow-lg"
                            style={{
                              left: `${Math.min(
                                Math.max(itemHoverGrafico.x, 96),
                                graficoLayout.largura - 96
                              )}px`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            <p className="font-semibold text-slate-100">
                              Dia {String(itemHoverGrafico.dia).padStart(2, "0")}
                            </p>
                            <p className="text-sky-300">USD: {formatarNumero(itemHoverGrafico.usd)}</p>
                            <p className={itemHoverGrafico.roi >= 0 ? "text-violet-300" : "text-rose-300"}>
                              ROI: {formatarNumero(itemHoverGrafico.roi)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {!modoAuxiliar && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <button
            type="button"
            onClick={() => setConfigAberta((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0b1222]/80 px-5 py-4 text-left"
          >
            <div>
              <h2 className="text-xl font-extrabold text-slate-100 md:text-2xl">
                Configurações da operação
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Abra para alterar dólar e taxas desta operação
              </p>
            </div>

            <span className="text-sm font-semibold text-cyan-200">
              {configAberta ? "Fechar" : "Abrir"}
            </span>
          </button>

          {configAberta && (
            <div className="mt-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm text-slate-400">
                    Essas configurações controlam toda a planilha desta operação.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={salvarConfiguracoes}
                  disabled={salvandoConfiguracoes || carregando || !operacao}
                  className="rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {salvandoConfiguracoes ? "Salvando configurações..." : "Salvar configurações"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Cotação do dólar
                  </label>
                  <input
                    value={cotacaoDolar}
                    onChange={(e) => setCotacaoDolar(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-[#0f172a] px-4 py-3 text-base text-slate-100"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Taxa Facebook %
                  </label>
                  <input
                    value={taxaFacebook}
                    onChange={(e) => setTaxaFacebook(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-[#0f172a] px-4 py-3 text-base text-slate-100"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Taxa Network %
                  </label>
                  <input
                    value={taxaNetwork}
                    onChange={(e) => setTaxaNetwork(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-[#0f172a] px-4 py-3 text-base text-slate-100"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Taxa Imposto %
                  </label>
                  <input
                    value={taxaImposto}
                    onChange={(e) => setTaxaImposto(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-[#0f172a] px-4 py-3 text-base text-slate-100"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Repasse %
                  </label>
                  <input
                    value={repassePercentual}
                    onChange={(e) => setRepassePercentual(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-[#0f172a] px-4 py-3 text-base text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
        )}

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <button
            type="button"
            onClick={() => setInsightsAberto((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0b1222]/80 px-5 py-4 text-left"
          >
            <div>
              <h2 className="text-xl font-extrabold text-slate-100 md:text-2xl">📊 Insights do E-CPM</h2>
              <p className="mt-1 text-sm text-slate-400">
                Camada analítica da operação para leitura rápida de E-CPM.
              </p>
            </div>
            <span className="text-sm font-semibold text-cyan-200">
              {insightsAberto ? "Fechar" : "Abrir"}
            </span>
          </button>

          {insightsAberto && (insightsOperacao.totalDiasValidos === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-white/20 bg-[#0b1222]/70 px-4 py-3 text-sm text-slate-300">
              Nenhum E-CPM preenchido no período para gerar insights.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    E-CPM médio
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-cyan-300 md:text-2xl">
                    {formatarNumero(insightsOperacao.mediaEcpm)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {insightsOperacao.totalDiasValidos} dia(s) com E-CPM preenchido
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Melhor dia
                  </p>
                  <p className="mt-2 text-sm font-bold text-emerald-300 md:text-base">
                    {insightsOperacao.melhorDia?.dataFormatada}
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-300 md:text-2xl">
                    {formatarNumero(insightsOperacao.melhorDia?.ecpm ?? 0)}
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Pior dia
                  </p>
                  <p className="mt-2 text-sm font-bold text-amber-300 md:text-base">
                    {insightsOperacao.piorDia?.dataFormatada}
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-amber-300 md:text-2xl">
                    {formatarNumero(insightsOperacao.piorDia?.ecpm ?? 0)}
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Melhor semana
                  </p>
                  {insightsOperacao.melhorSemanaDoMes ? (
                    <>
                      <p className="mt-2 text-sm font-bold text-cyan-300 md:text-base">
                        {insightsOperacao.melhorSemanaDoMes.semanaLabel}
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-cyan-300 md:text-2xl">
                        {formatarNumero(insightsOperacao.melhorSemanaDoMes.mediaEcpm)}
                      </p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          insightsOperacao.melhorSemanaDoMes.percentualVsMediaMes >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {insightsOperacao.melhorSemanaDoMes.percentualVsMediaMes >= 0 ? "+" : ""}
                        {formatarNumero(insightsOperacao.melhorSemanaDoMes.percentualVsMediaMes)}% vs média
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      Dados insuficientes para identificar a melhor semana.
                    </p>
                  )}
                </article>

                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    E-CPM atual
                  </p>
                  {insightsOperacao.ecpmAtualVsMedia ? (
                    <>
                      <p className="mt-2 text-sm font-bold text-slate-200 md:text-base">
                        {insightsOperacao.ecpmAtualVsMedia.dataFormatada}
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-cyan-300 md:text-2xl">
                        {formatarNumero(insightsOperacao.ecpmAtualVsMedia.ecpmAtual)}
                      </p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          insightsOperacao.ecpmAtualVsMedia.percentualVsMediaMes >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {insightsOperacao.ecpmAtualVsMedia.percentualVsMediaMes >= 0 ? "+" : ""}
                        {formatarNumero(insightsOperacao.ecpmAtualVsMedia.percentualVsMediaMes)}% vs mês
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      Sem dados no mês
                    </p>
                  )}
                </article>
              </div>

              <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-relaxed">
                  <h3 className="font-extrabold uppercase tracking-wide text-slate-300">
                    TOP 5 DIAS DE E-CPM :
                  </h3>
                  <p>
                    {insightsOperacao.top5DiasEcpm.map((item, index) => (
                      <span key={`${item.dataFormatada}-${item.ecpm}-${index}`}>
                        <span className="text-slate-100">{item.dataFormatada}</span>
                        <span className="text-slate-300"> = </span>
                        <span className="text-emerald-300">{formatarNumero(item.ecpm)}</span>
                        {index < insightsOperacao.top5DiasEcpm.length - 1 && (
                          <span className="px-2 text-slate-500">/</span>
                        )}
                      </span>
                    ))}
                  </p>
                </div>
              </article>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-300 md:text-base">
                    🔥 Melhores dias para escalar (Média do mês)
                  </h3>

                  <ul className="mt-3 space-y-2">
                    {insightsOperacao.melhoresDiasSemana.map((item, index) => (
                      <li
                        key={`${item.diaSemana}-${item.mediaEcpm}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f172a]/70 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-slate-100">
                          {item.diaSemana}
                        </span>
                        <span className="text-sm font-extrabold text-cyan-300">
                          {formatarNumero(item.mediaEcpm)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-300 md:text-base">
                    ⚠ Dias que precisam de atenção
                  </h3>

                  <ul className="mt-3 space-y-2">
                    {insightsOperacao.pioresDiasSemana.map((item, index) => (
                      <li
                        key={`${item.diaSemana}-${item.mediaEcpm}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f172a]/70 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-slate-100">
                          {item.diaSemana}
                        </span>
                        <span className="text-sm font-extrabold text-amber-300">
                          {formatarNumero(item.mediaEcpm)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-100 md:text-2xl">
                Lançamentos diários
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Preencha Facebook, USD e E-CPM por dia. O sistema calcula o restante automaticamente.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1222]/80 px-4 py-3 text-sm text-slate-300">
              Enter salva e avança. Setas sobem e descem entre os dias.
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-2xl">
            <table className="w-full border-separate border-spacing-y-2 text-[11px] md:text-xs xl:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="bg-[#0b1222] px-2 py-3 text-left font-semibold">Dia</th>
                  <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Facebook</th>
                  {!modoAuxiliar && (
                    <>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Tx. Face</th>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Net</th>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Imp</th>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Custo</th>
                    </>
                  )}
                  <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">USD</th>
                  <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">E-CPM</th>
                  {!modoAuxiliar && (
                    <>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Real</th>
                      <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Lucro</th>
                    </>
                  )}
                  <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">ROI</th>
                  {!modoAuxiliar && (
                    <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">Rep</th>
                  )}
                  {!modoAuxiliar && operacaoEhGestor && (
                    <th className="bg-[#0b1222] px-2 py-3 text-center font-semibold">
                      Rep Liq
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {linhas.map((linha, index) => {
                  const dolar = parseNumero(cotacaoDolar);
                  const taxaFace = parseNumero(taxaFacebook);
                  const taxaNet = parseNumero(taxaNetwork);
                  const taxaImp = parseNumero(taxaImposto);

                  const facebook = parseNumero(linha.face);
                  const usd = parseNumero(linha.usd);

                  const real = usd * dolar;
                  const txFace = facebook * (taxaFace / 100);
                  const net = real * (taxaNet / 100);
                  const imp = real * (taxaImp / 100);
                  const custo = facebook + txFace + net + imp;
                  const lucro = real - custo;
                  const roi = custo > 0 ? (lucro / custo) * 100 : 0;
                  const rep = lucro * (percentualRepasse / 100);
                  const repLiq = rep * (PERCENTUAL_REPASSE_LIQUIDO / 100);

                  const ativa = linhaAtiva === linha.diaNumero;

                  return (
                    <tr
                      key={linha.diaNumero}
                      className={
                        ativa
                          ? "bg-cyan-500/15"
                          : index % 2 === 0
                          ? "bg-[#0b1222]/70"
                          : "bg-[#0f172a]/70"
                      }
                    >
                      <td className="rounded-l-2xl px-2 py-3 font-medium text-slate-200">
                        {linha.diaSemana} - {linha.dataFormatada}
                      </td>

                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            faceRefs.current[linha.diaNumero] = el;
                          }}
                          value={linha.face}
                          onFocus={() => setLinhaAtiva(linha.diaNumero)}
                          onChange={(e) => atualizarCampo(linha.diaNumero, "face", e.target.value)}
                          onKeyDown={(e) => tratarTeclaCampo(e, linha.diaNumero, "face")}
                          onBlur={() => tratarBlurCampo(linha.diaNumero)}
                          className="w-full rounded-lg border border-white/20 bg-[#0b1222] px-2 py-2 text-center text-red-600"
                        />
                      </td>

                      {!modoAuxiliar && (
                        <>
                          <td className="px-2 py-3 text-center text-red-600">
                            {formatarNumero(txFace)}
                          </td>

                          <td className="px-2 py-3 text-center text-slate-300">
                            {formatarNumero(net)}
                          </td>

                          <td className="px-2 py-3 text-center text-slate-300">
                            {formatarNumero(imp)}
                          </td>

                          <td className="px-2 py-3 text-center text-red-600">
                            {formatarNumero(custo)}
                          </td>
                        </>
                      )}

                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            usdRefs.current[linha.diaNumero] = el;
                          }}
                          value={linha.usd}
                          onFocus={() => setLinhaAtiva(linha.diaNumero)}
                          onChange={(e) => atualizarCampo(linha.diaNumero, "usd", e.target.value)}
                          onKeyDown={(e) => tratarTeclaCampo(e, linha.diaNumero, "usd")}
                          onBlur={() => tratarBlurCampo(linha.diaNumero)}
                          className={`w-full rounded-lg border border-white/20 bg-[#0b1222] px-2 py-2 text-center ${
                            operacaoEhGestor ? "text-sky-300" : "text-blue-600"
                          }`}
                        />
                      </td>

                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            ecpmRefs.current[linha.diaNumero] = el;
                          }}
                          value={linha.ecpm}
                          onFocus={() => setLinhaAtiva(linha.diaNumero)}
                          onChange={(e) => atualizarCampo(linha.diaNumero, "ecpm", e.target.value)}
                          onKeyDown={(e) => tratarTeclaCampo(e, linha.diaNumero, "ecpm")}
                          onBlur={() => tratarBlurCampo(linha.diaNumero)}
                          className="w-full rounded-lg border border-white/20 bg-[#0b1222] px-2 py-2 text-center text-violet-200"
                        />
                      </td>

                      {!modoAuxiliar && (
                        <>
                          <td
                            className={`px-2 py-3 text-center ${
                              operacaoEhGestor ? "text-sky-300" : "text-blue-600"
                            }`}
                          >
                            {formatarNumero(real)}
                          </td>

                          <td className="px-2 py-3 text-center text-green-600">
                            {formatarNumero(lucro)}
                          </td>
                        </>
                      )}

                      <td
                        className={`px-2 py-3 text-center ${getCorROI(roi)} ${
                          modoAuxiliar ? "rounded-r-2xl" : ""
                        }`}
                      >
                        {formatarNumero(roi)}%
                      </td>

                      {!modoAuxiliar && (
                        <td
                          className={`px-2 py-3 text-center ${getCorRepasse(rep)}`}
                        >
                          {formatarNumero(rep)}
                        </td>
                      )}

                      {!modoAuxiliar && operacaoEhGestor && (
                        <td
                          className={`rounded-r-2xl px-2 py-3 text-center ${getCorRepasseLiquido(
                            repLiq
                          )}`}
                        >
                          {formatarNumero(repLiq)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {toastMensagem && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-green-300 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700 shadow-lg">
          {toastMensagem}
        </div>
      )}
    </main>
  );
}
