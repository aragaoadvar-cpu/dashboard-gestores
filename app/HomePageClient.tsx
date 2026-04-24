"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "../lib/supabase/client";
import UserAvatar from "./components/UserAvatar";

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

type Lancamento = {
  id: number;
  operacao_id: number;
  dia: number;
  facebook: number | null;
  usd: number | null;
};

type Despesa = {
  id: number;
  nome: string;
  valor: number | null;
  percentual_desconto: number | null;
  mes: number;
  ano: number;
  user_id: string | null;
};

type ResumoOperacao = {
  custo: number;
  receita: number;
  lucro: number;
  roi: number;
  repasse: number;
  repasseLiquido: number;
};

type ResumoKpi = {
  custoTotal: number;
  receitaTotal: number;
  lucroLiquido: number;
  roiMes: number;
  repasseTotal: number;
  repasseLiquidoBase: number;
  totalDespesas: number;
  descontoDespesas: number;
  repasseLiquidoFinal: number;
};

type PerfilUsuario = {
  id: string;
  nome: string | null;
  email: string | null;
  role: "dono" | "admin" | "gestor" | "auxiliar" | null;
};

type AdminGestorTaxas = {
  gestor_user_id: string;
  taxa_facebook_admin: number | null;
  taxa_network_admin: number | null;
  taxa_imposto_admin: number | null;
  cotacao_dolar_admin: number | null;
  repasse_percentual_admin: number | null;
};

type ModoTemporalDashboard = "periodo" | "ontem" | "hoje";

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

const PERCENTUAL_REPASSE_PADRAO = 20;
const PERCENTUAL_REPASSE_LIQUIDO = 50;

const FRASES_ROI_ALTO = [
  "Excelente trabalho. ROI acima de 60% não é sorte, é controle, inteligência e execução de elite.",
  "Você não está apenas rodando campanhas. Você está operando com precisão de quem entende o jogo.",
  "Resultado forte. Isso mostra disciplina, leitura de cenário e cuidado real com a operação.",
  "ROI nesse nível é assinatura de gestor atento. Bom trabalho, continue pressionando com inteligência.",
  "Você conduziu a operação com firmeza. Performance alta é reflexo direto do seu padrão de execução.",
  "Alta eficiência. Quando o cuidado com os detalhes aparece, o resultado responde desse jeito.",
  "Esse número confirma uma coisa: sua operação está sendo conduzida com cabeça fria e mão firme.",
  "Ótimo desempenho. É assim que se constrói resultado sólido: atenção, constância e critério.",
  "Você está mostrando domínio operacional. ROI forte é consequência de decisão boa repetida com consistência.",
  "Parabéns pelo trabalho. Esse resultado tem cara de gestor que acompanha, ajusta e protege a margem.",
];

const FRASES_ROI_BAIXO = [
  "Ainda não é o resultado ideal, mas operação boa também se constrói nos ajustes. Respira, revisa e corrige com critério.",
  "ROI baixo pede atenção, não desespero. Olhe a margem, refine a execução e proteja a operação.",
  "Esse momento exige foco nos detalhes. Quem ajusta rápido e com calma volta forte.",
  "A operação está pedindo leitura mais fina. Controle, paciência e decisão limpa viram o jogo.",
  "Nem todo mês começa bonito, mas gestor forte reage cedo. Revise custos, preserve margem e siga firme.",
  "Resultado abaixo do esperado não define sua capacidade. O que define é a qualidade da próxima decisão.",
  "Hora de operar com mais precisão. Menos impulso, mais análise, mais proteção do caixa.",
  "Atenção total agora. Pequenos ajustes bem feitos podem mudar completamente o fechamento.",
  "Toda operação manda sinais. Escute os números, corrija com inteligência e mantenha a disciplina.",
  "Você não precisa acelerar no escuro. Precisa enxergar melhor, cortar desperdício e recuperar eficiência.",
];

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCorPorValor(valor: number) {
  if (valor < 0) return "text-red-600";
  if (valor <= 30) return "text-yellow-500";
  return "text-green-600";
}

function getFraseAleatoria(frases: string[], seed: number) {
  const indice = Math.abs(Math.floor(seed)) % frases.length;
  return frases[indice];
}

function calcularResumoPorLancamentos(
  operacao: Operacao,
  lancamentos: Lancamento[],
  repassePercentualOverride: number | null = null
): ResumoOperacao {
  const cotacaoDolar = Number(operacao.cotacao_dolar ?? 5.1);
  const taxaFacebook = Number(operacao.taxa_facebook ?? 13.85);
  const taxaNetwork = Number(operacao.taxa_network ?? 6.5);
  const taxaImposto = Number(operacao.taxa_imposto ?? 7);

  let custo = 0;
  let receita = 0;
  let lucro = 0;

  for (const lancamento of lancamentos) {
    const facebook = Number(lancamento.facebook ?? 0);
    const usd = Number(lancamento.usd ?? 0);

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
      ? Number(operacao.repasse_percentual ?? PERCENTUAL_REPASSE_PADRAO)
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

function aplicarOverrideAdminNaOperacao(
  operacao: Operacao,
  override: AdminGestorTaxas | null
): Operacao {
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

function getRepassePercentualComOverride(
  operacao: Operacao,
  override: AdminGestorTaxas | null
): number | null {
  if (!override || override.repasse_percentual_admin === null) {
    return Number(operacao.repasse_percentual ?? PERCENTUAL_REPASSE_PADRAO);
  }
  return Number(override.repasse_percentual_admin);
}

export default function HomePageClient() {
  const supabase = createClient();

  const hoje = new Date();
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());

  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [roleUsuario, setRoleUsuario] = useState<"dono" | "admin" | "gestor" | "auxiliar">("gestor");
  const [userIdAtual, setUserIdAtual] = useState("");
  const [ownerIdAuxiliar, setOwnerIdAuxiliar] = useState<string | null>(null);
  const [gestoresVinculadosIds, setGestoresVinculadosIds] = useState<string[]>([]);
  const [adminIdsSistema, setAdminIdsSistema] = useState<string[]>([]);
  const [perfisUsuarioPorId, setPerfisUsuarioPorId] = useState<Record<string, PerfilUsuario>>({});
  const [taxasAdminPorGestorId, setTaxasAdminPorGestorId] = useState<
    Record<string, AdminGestorTaxas>
  >({});
  const [kpisAbertos, setKpisAbertos] = useState(false);
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const [modoTemporal, setModoTemporal] = useState<ModoTemporalDashboard>("periodo");

  useEffect(() => {
    try {
      const valorSalvo = window.localStorage.getItem("home_kpis_abertos");
      if (valorSalvo === "1") setKpisAbertos(true);
      if (valorSalvo === "0") setKpisAbertos(false);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("home_kpis_abertos", kpisAbertos ? "1" : "0");
    } catch {}
  }, [kpisAbertos]);

  const periodosDisponiveis = useMemo(() => {
    const itens: { mes: number; ano: number; label: string }[] = [];
    const anoBase = hoje.getFullYear();

    for (let ano = anoBase - 1; ano <= anoBase + 2; ano++) {
      for (let mes = 1; mes <= 12; mes++) {
        const mesInfo = MESES.find((item) => item.valor === mes);
        itens.push({
          mes,
          ano,
          label: `${mesInfo?.label}/${ano}`,
        });
      }
    }

    return itens.sort((a, b) => {
      if (a.ano !== b.ano) return b.ano - a.ano;
      return b.mes - a.mes;
    });
  }, [hoje]);

  const nomeMesSelecionado = useMemo(() => {
    return MESES.find((mes) => mes.valor === mesSelecionado)?.nome || "";
  }, [mesSelecionado]);

  const contextoTemporal = useMemo(() => {
    if (modoTemporal === "periodo") {
      return {
        diaAlvo: null as number | null,
        foraDoMesAtual: false,
      };
    }

    const agora = new Date();
    const mesAtual = agora.getMonth() + 1;
    const anoAtual = agora.getFullYear();
    const periodoSelecionadoEhAtual =
      mesSelecionado === mesAtual && anoSelecionado === anoAtual;

    if (!periodoSelecionadoEhAtual) {
      return {
        diaAlvo: null as number | null,
        foraDoMesAtual: true,
      };
    }

    if (modoTemporal === "hoje") {
      return {
        diaAlvo: agora.getDate(),
        foraDoMesAtual: false,
      };
    }

    const ontem = new Date(agora);
    ontem.setDate(agora.getDate() - 1);
    const ontemEstaNoMesSelecionado =
      ontem.getMonth() + 1 === mesSelecionado && ontem.getFullYear() === anoSelecionado;

    return {
      diaAlvo: ontemEstaNoMesSelecionado ? ontem.getDate() : null,
      foraDoMesAtual: false,
    };
  }, [modoTemporal, mesSelecionado, anoSelecionado]);

  const lancamentosFiltradosTemporal = useMemo(() => {
    if (modoTemporal === "periodo") return lancamentos;
    if (contextoTemporal.diaAlvo === null) return [];
    return lancamentos.filter((item) => item.dia === contextoTemporal.diaAlvo);
  }, [lancamentos, modoTemporal, contextoTemporal.diaAlvo]);

  const despesasAplicadasTemporal = useMemo(() => {
    return modoTemporal === "periodo" ? despesas : [];
  }, [modoTemporal, despesas]);

  async function carregarDados() {
    setCarregando(true);
    setErro("");
    setMensagem("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setEmailUsuario("");
      setRoleUsuario("gestor");
      setUserIdAtual("");
      setOwnerIdAuxiliar(null);
      setGestoresVinculadosIds([]);
      setAdminIdsSistema([]);
      setPerfisUsuarioPorId({});
      setTaxasAdminPorGestorId({});
      setErro("Usuário não autenticado.");
      setCarregando(false);
      return;
    }
    setEmailUsuario(user.email ?? "Usuário autenticado");
    setUserIdAtual(user.id);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setErro(
        `Erro ao carregar perfil do usuário: ${
          profileError?.message ?? "Perfil não encontrado."
        }`
      );
      setCarregando(false);
      return;
    }

    const roleAtual =
      profileData.role === "dono"
        ? "dono"
        : profileData.role === "admin"
        ? "admin"
        : profileData.role === "auxiliar"
        ? "auxiliar"
        : "gestor";

    if (roleUsuario !== roleAtual) {
      setRoleUsuario(roleAtual);
    }

    let gestoresDoAdmin: string[] = [];
    let adminsDoSistema: string[] = [];
    let ownerDoAuxiliar: string | null = null;
    let operacaoIdsPermitidasAuxiliar: number[] = [];
    if (roleAtual === "admin") {
      const { data: gestoresData, error: gestoresError } = await supabase
        .from("admin_gestores")
        .select("gestor_user_id")
        .eq("admin_user_id", user.id)
        .eq("status", "ativo");

      if (gestoresError) {
        setErro(`Erro ao carregar gestores vinculados: ${JSON.stringify(gestoresError)}`);
        setCarregando(false);
        return;
      }

      gestoresDoAdmin =
        (gestoresData as Array<{ gestor_user_id: string | null }>)
          ?.map((item) => item.gestor_user_id)
          .filter((id): id is string => Boolean(id)) || [];

      if (gestoresDoAdmin.length > 0) {
        const { data: taxasData, error: taxasError } = await supabase
          .from("admin_gestor_taxas")
          .select(
            "gestor_user_id, taxa_facebook_admin, taxa_network_admin, taxa_imposto_admin, cotacao_dolar_admin, repasse_percentual_admin"
          )
          .eq("admin_user_id", user.id)
          .in("gestor_user_id", gestoresDoAdmin);

        if (taxasError) {
          setErro(`Erro ao carregar taxas administrativas: ${JSON.stringify(taxasError)}`);
          setCarregando(false);
          return;
        }

        const mapaTaxas: Record<string, AdminGestorTaxas> = {};
        for (const item of (taxasData as AdminGestorTaxas[]) || []) {
          mapaTaxas[item.gestor_user_id] = item;
        }
        setTaxasAdminPorGestorId(mapaTaxas);
      } else {
        setTaxasAdminPorGestorId({});
      }
    } else if (roleAtual === "dono") {
      const { data: adminsData, error: adminsError } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if (adminsError) {
        setErro(`Erro ao carregar admins do sistema: ${JSON.stringify(adminsError)}`);
        setCarregando(false);
        return;
      }

      adminsDoSistema = ((adminsData as Array<{ id: string }>) || []).map((item) => item.id);
      setTaxasAdminPorGestorId({});
    } else if (roleAtual === "auxiliar") {
      const { data: ownerIdAuxiliarData, error: ownerIdAuxiliarError } = await supabase.rpc(
        "get_auxiliar_owner_id",
        { check_auxiliar_id: user.id }
      );

      if (ownerIdAuxiliarError) {
        setErro(`Erro ao carregar vínculo do auxiliar: ${JSON.stringify(ownerIdAuxiliarError)}`);
        setCarregando(false);
        return;
      }

      if (!ownerIdAuxiliarData) {
        setErro("Auxiliar sem vínculo ativo com admin/gestor.");
        setCarregando(false);
        return;
      }

      ownerDoAuxiliar = ownerIdAuxiliarData;

      const { data: permissoesAuxiliarData, error: permissoesAuxiliarError } = await supabase
        .from("operacao_auxiliares")
        .select("operacao_id")
        .eq("auxiliar_user_id", user.id);

      if (permissoesAuxiliarError) {
        setErro(
          `Erro ao carregar permissões de operações do auxiliar: ${JSON.stringify(
            permissoesAuxiliarError
          )}`
        );
        setCarregando(false);
        return;
      }

      operacaoIdsPermitidasAuxiliar =
        ((permissoesAuxiliarData as Array<{ operacao_id: number | null }>) || [])
          .map((item) => Number(item.operacao_id))
          .filter((id) => Number.isInteger(id) && id > 0);

      setTaxasAdminPorGestorId({});
    } else {
      setTaxasAdminPorGestorId({});
    }
    setGestoresVinculadosIds(gestoresDoAdmin);
    setAdminIdsSistema(adminsDoSistema);
    setOwnerIdAuxiliar(ownerDoAuxiliar);

    let operacoesData: Operacao[] | null = null;
    let operacoesError: unknown = null;

    if (roleAtual === "auxiliar") {
      if (operacaoIdsPermitidasAuxiliar.length === 0) {
        operacoesData = [];
      } else {
        const resultado = await supabase
          .from("operacoes")
          .select(
            "id, nome, mes, ano, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual"
          )
          .in("id", operacaoIdsPermitidasAuxiliar)
          .eq("mes", mesSelecionado)
          .eq("ano", anoSelecionado)
          .order("id", { ascending: true });

        operacoesData = (resultado.data as Operacao[] | null) ?? null;
        operacoesError = resultado.error;
      }
    } else {
      let operacoesQuery = supabase
        .from("operacoes")
        .select(
          "id, nome, mes, ano, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual"
        )
        .eq("mes", mesSelecionado)
        .eq("ano", anoSelecionado)
        .order("id", { ascending: true });

      if (roleAtual === "gestor") {
        operacoesQuery = operacoesQuery.eq("user_id", user.id);
      } else if (roleAtual === "admin") {
        operacoesQuery = operacoesQuery.in("user_id", [user.id, ...gestoresDoAdmin]);
      }

      const resultado = await operacoesQuery;
      operacoesData = (resultado.data as Operacao[] | null) ?? null;
      operacoesError = resultado.error;
    }

    if (operacoesError) {
      setErro(`Erro ao carregar operações: ${JSON.stringify(operacoesError)}`);
      setCarregando(false);
      return;
    }

    const operacoesLista = (operacoesData as Operacao[]) || [];
    setOperacoes(operacoesLista);

    const operacaoIds = operacoesLista.map((item) => item.id);

    if (operacaoIds.length > 0) {
      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from("lancamentos")
        .select("id, operacao_id, dia, facebook, usd")
        .in("operacao_id", operacaoIds)
        .order("id", { ascending: true });

      if (lancamentosError) {
        setErro(`Erro ao carregar lançamentos: ${JSON.stringify(lancamentosError)}`);
        setCarregando(false);
        return;
      }

      setLancamentos((lancamentosData as Lancamento[]) || []);
    } else {
      setLancamentos([]);
    }

    let despesasQuery = supabase
      .from("despesas")
      .select("id, nome, valor, percentual_desconto, mes, ano, user_id")
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado)
      .order("id", { ascending: false });

    if (roleAtual === "gestor") {
      despesasQuery = despesasQuery.eq("user_id", user.id);
    } else if (roleAtual === "admin") {
      despesasQuery = despesasQuery.in("user_id", [user.id, ...gestoresDoAdmin]);
    } else if (roleAtual === "auxiliar" && ownerDoAuxiliar) {
      despesasQuery = despesasQuery.eq("user_id", ownerDoAuxiliar);
    }

    const { data: despesasData, error: despesasError } = await despesasQuery;

    if (despesasError) {
      setErro(`Erro ao carregar despesas: ${JSON.stringify(despesasError)}`);
      setCarregando(false);
      return;
    }

    const despesasLista = (despesasData as Despesa[]) || [];
    setDespesas(despesasLista);

    const idsParaRanking =
      roleAtual === "admin"
        ? [user.id, ...gestoresDoAdmin]
        : roleAtual === "dono"
        ? adminsDoSistema
        : [];

    const ownerIds = Array.from(
      new Set(
        [
          user.id,
          ...idsParaRanking,
          ...operacoesLista.map((item) => item.user_id),
          ...despesasLista.map((item) => item.user_id),
        ].filter(Boolean)
      )
    ) as string[];

    if (ownerIds.length > 0) {
      let perfisLista:
        | Array<{
            id: string;
            nome: string | null;
            email: string | null;
            role: string | null;
          }>
        | null = null;

      const { data: perfisData, error: perfisError } = await supabase
        .from("profiles")
        .select("id, nome, role")
        .in("id", ownerIds);

      if (!perfisError) {
        perfisLista = ((perfisData as Array<{
          id: string;
          nome: string | null;
          role: string | null;
        }>) || []).map((item) => ({
          id: item.id,
          nome: item.nome,
          role: item.role,
          email: null,
        }));
      } else {
        const { data: perfisFallbackData, error: perfisFallbackError } = await supabase
          .from("profiles")
          .select("id, nome, role")
          .in("id", ownerIds);

        if (!perfisFallbackError) {
          perfisLista = ((perfisFallbackData as Array<{
            id: string;
            nome: string | null;
            role: string | null;
          }>) || []).map((item) => ({
            id: item.id,
            nome: item.nome,
            role: item.role,
            email: null,
          }));
        } else {
          const { data: perfisMinimosData, error: perfisMinimosError } = await supabase
            .from("profiles")
            .select("id, nome, role")
            .in("id", ownerIds);

          if (perfisMinimosError) {
            setErro(`Erro ao carregar perfis de usuários: ${JSON.stringify(perfisMinimosError)}`);
            setCarregando(false);
            return;
          }

          perfisLista = ((perfisMinimosData as Array<{
            id: string;
            nome: string | null;
            role: string | null;
          }>) || []).map((item) => ({
            id: item.id,
            nome: item.nome,
            role: item.role,
            email: null,
          }));
        }
      }

      const perfisMap: Record<string, PerfilUsuario> = {};
      for (const perfil of perfisLista || []) {
        perfisMap[perfil.id] = {
          id: perfil.id,
          nome: perfil.nome,
          email: perfil.email,
          role:
            perfil.role === "dono"
              ? "dono"
              : perfil.role === "admin"
              ? "admin"
              : perfil.role === "auxiliar"
              ? "auxiliar"
              : perfil.role === "gestor"
              ? "gestor"
              : null,
        };
      }
      setPerfisUsuarioPorId(perfisMap);
    } else {
      setPerfisUsuarioPorId({});
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregarDados();
  }, [mesSelecionado, anoSelecionado]);

  const resumoPorOperacaoReal = useMemo(() => {
    const mapa = new Map<number, ResumoOperacao>();

    for (const operacao of operacoes) {
      const lancamentosDaOperacao = lancamentosFiltradosTemporal.filter(
        (item) => item.operacao_id === operacao.id
      );

      mapa.set(operacao.id, calcularResumoPorLancamentos(operacao, lancamentosDaOperacao));
    }

    return mapa;
  }, [operacoes, lancamentosFiltradosTemporal]);

  const resumoPorOperacaoAdmin = useMemo(() => {
    const mapa = new Map<number, ResumoOperacao>();

    for (const operacao of operacoes) {
      const lancamentosDaOperacao = lancamentosFiltradosTemporal.filter(
        (item) => item.operacao_id === operacao.id
      );

      const ownerId = operacao.user_id ?? "";
      const deveAplicarOverride =
        roleUsuario === "admin" && ownerId !== "" && ownerId !== userIdAtual;
      const override = deveAplicarOverride ? taxasAdminPorGestorId[ownerId] ?? null : null;
      const operacaoParaCalculo = aplicarOverrideAdminNaOperacao(operacao, override);
      const repassePercentual = getRepassePercentualComOverride(operacao, override);

      mapa.set(
        operacao.id,
        calcularResumoPorLancamentos(
          operacaoParaCalculo,
          lancamentosDaOperacao,
          repassePercentual
        )
      );
    }

    return mapa;
  }, [operacoes, lancamentosFiltradosTemporal, roleUsuario, userIdAtual, taxasAdminPorGestorId]);

  const totaisPorEscopo = useMemo(() => {
    function calcularTotais(
      operacoesEscopo: Operacao[],
      despesasEscopo: Despesa[]
    ): ResumoKpi {
      let custoTotal = 0;
      let receitaTotal = 0;
      let lucroLiquido = 0;
      let repasseTotal = 0;
      let repasseLiquidoBase = 0;

      const resumosParaTotais = roleUsuario === "admin" ? resumoPorOperacaoAdmin : resumoPorOperacaoReal;

      for (const operacao of operacoesEscopo) {
        const resumo = resumosParaTotais.get(operacao.id);
        if (!resumo) continue;

        custoTotal += resumo.custo;
        receitaTotal += resumo.receita;
        lucroLiquido += resumo.lucro;
        repasseTotal += resumo.repasse;
        repasseLiquidoBase += resumo.repasseLiquido;
      }

      const totalDespesas = despesasEscopo.reduce(
        (acc, despesa) => acc + Number(despesa.valor ?? 0),
        0
      );

      const descontoDespesas = despesasEscopo.reduce((acc, despesa) => {
        const valor = Number(despesa.valor ?? 0);
        const percentual = Number(despesa.percentual_desconto ?? 0);
        return acc + valor * (percentual / 100);
      }, 0);

      return {
        custoTotal,
        receitaTotal,
        lucroLiquido,
        roiMes: custoTotal > 0 ? (lucroLiquido / custoTotal) * 100 : 0,
        repasseTotal,
        repasseLiquidoBase,
        totalDespesas,
        descontoDespesas,
        repasseLiquidoFinal: repasseLiquidoBase - descontoDespesas,
      };
    }

    const gestoresSet = new Set(gestoresVinculadosIds);
    const userIdBaseEscopo =
      roleUsuario === "auxiliar" ? ownerIdAuxiliar ?? userIdAtual : userIdAtual;

    const operacoesProprias = operacoes.filter((operacao) => operacao.user_id === userIdBaseEscopo);
    const despesasProprias = despesasAplicadasTemporal.filter(
      (despesa) => despesa.user_id === userIdBaseEscopo
    );

    const operacoesEquipe =
      roleUsuario === "admin"
        ? operacoes.filter((operacao) => operacao.user_id && gestoresSet.has(operacao.user_id))
        : roleUsuario === "dono"
        ? operacoes.filter((operacao) => operacao.user_id !== userIdAtual)
        : [];

    const despesasEquipe =
      roleUsuario === "admin"
        ? despesasAplicadasTemporal.filter(
            (despesa) => despesa.user_id && gestoresSet.has(despesa.user_id)
          )
        : roleUsuario === "dono"
        ? despesasAplicadasTemporal.filter((despesa) => despesa.user_id !== userIdAtual)
        : [];

    return {
      proprio: calcularTotais(operacoesProprias, despesasProprias),
      equipe: calcularTotais(operacoesEquipe, despesasEquipe),
      consolidado: calcularTotais(operacoes, despesasAplicadasTemporal),
    };
  }, [
    operacoes,
    despesasAplicadasTemporal,
    resumoPorOperacaoReal,
    resumoPorOperacaoAdmin,
    roleUsuario,
    userIdAtual,
    ownerIdAuxiliar,
    gestoresVinculadosIds,
  ]);

  const ranking = useMemo(() => {
    function getLabel(userId: string) {
      const perfil = perfisUsuarioPorId[userId];
      const nome = perfil?.nome?.trim() || "";
      const email = perfil?.email?.trim() || "";

      if (roleUsuario === "admin" && userId === userIdAtual) {
        if (nome) return `${nome} (Você)`;
        if (email) return `${email} (Você)`;
        if (emailUsuario.trim()) return `${emailUsuario.trim()} (Você)`;
        return "Minhas Operações";
      }

      if (nome && email) return `${nome} (${email})`;
      return nome || email || "Usuário sem identificação";
    }

    const alvoIds =
      roleUsuario === "admin"
        ? [userIdAtual, ...gestoresVinculadosIds]
        : roleUsuario === "dono"
        ? adminIdsSistema
        : [];

    if (alvoIds.length === 0) return [];

    const alvoSet = new Set(alvoIds);
    const resumoVazio: ResumoKpi = {
      custoTotal: 0,
      receitaTotal: 0,
      lucroLiquido: 0,
      roiMes: 0,
      repasseTotal: 0,
      repasseLiquidoBase: 0,
      totalDespesas: 0,
      descontoDespesas: 0,
      repasseLiquidoFinal: 0,
    };

    const porUsuario = new Map<string, ResumoKpi>();
    for (const userId of alvoIds) {
      porUsuario.set(userId, { ...resumoVazio });
    }

    for (const operacao of operacoes) {
      if (!operacao.user_id || !alvoSet.has(operacao.user_id)) continue;
      const resumo = resumoPorOperacaoReal.get(operacao.id);
      if (!resumo) continue;

      const atual = porUsuario.get(operacao.user_id) || { ...resumoVazio };
      atual.custoTotal += resumo.custo;
      atual.receitaTotal += resumo.receita;
      atual.lucroLiquido += resumo.lucro;
      atual.repasseTotal += resumo.repasse;
      atual.repasseLiquidoBase += resumo.repasseLiquido;
      porUsuario.set(operacao.user_id, atual);
    }

    for (const despesa of despesasAplicadasTemporal) {
      if (!despesa.user_id || !alvoSet.has(despesa.user_id)) continue;
      const atual = porUsuario.get(despesa.user_id) || { ...resumoVazio };
      const valor = Number(despesa.valor ?? 0);
      const percentual = Number(despesa.percentual_desconto ?? 0);
      atual.totalDespesas += valor;
      atual.descontoDespesas += valor * (percentual / 100);
      porUsuario.set(despesa.user_id, atual);
    }

    return Array.from(porUsuario.entries())
      .map(([userId, resumo]) => {
        const repasseLiquidoFinal = resumo.repasseLiquidoBase - resumo.descontoDespesas;
        const roiMes = resumo.custoTotal > 0 ? (resumo.lucroLiquido / resumo.custoTotal) * 100 : 0;
        const operacoesCount = operacoes.filter((operacao) => operacao.user_id === userId).length;
        return {
          userId,
          label: getLabel(userId),
          nome: perfisUsuarioPorId[userId]?.nome ?? null,
          email: perfisUsuarioPorId[userId]?.email ?? null,
          lucroLiquido: resumo.lucroLiquido,
          roiMes,
          repasseBruto: resumo.repasseTotal,
          operacoesCount,
          repasseLiquidoFinal,
        };
      })
      .sort((a, b) => {
        if (b.repasseBruto !== a.repasseBruto) return b.repasseBruto - a.repasseBruto;
        if (b.roiMes !== a.roiMes) return b.roiMes - a.roiMes;
        return b.lucroLiquido - a.lucroLiquido;
      });
  }, [
    roleUsuario,
    userIdAtual,
    emailUsuario,
    gestoresVinculadosIds,
    adminIdsSistema,
    operacoes,
    despesasAplicadasTemporal,
    resumoPorOperacaoReal,
    perfisUsuarioPorId,
  ]);

  const nomeAdminAtual = useMemo(() => {
    if (roleUsuario !== "admin") return "Admin";
    const nome = perfisUsuarioPorId[userIdAtual]?.nome?.trim() || "";
    if (nome) return nome;
    return emailUsuario.trim() || "Admin";
  }, [roleUsuario, perfisUsuarioPorId, userIdAtual, emailUsuario]);
  const nomeAdminAtualComCargo = useMemo(() => {
    if (nomeAdminAtual === "Admin") return "Admin";
    return `${nomeAdminAtual} - Admin`;
  }, [nomeAdminAtual]);

  const alertasPerformanceHome = useMemo(() => {
    if (roleUsuario !== "admin" && roleUsuario !== "dono") return [];
    if (ranking.length === 0) return [];

    const temDados = ranking.some(
      (item) =>
        Math.abs(item.lucroLiquido) > 0.0001 ||
        Math.abs(item.roiMes) > 0.0001 ||
        Math.abs(item.repasseLiquidoFinal) > 0.0001
    );

    if (!temDados) return [];

    const alertas: Array<{
      id: string;
      tipo: "negativo" | "atencao" | "destaque";
      texto: string;
    }> = [];

    for (const item of ranking.filter((item) => item.lucroLiquido < 0)) {
      alertas.push({
        id: `negativo-${item.userId}`,
        tipo: "negativo",
        texto: `⚠️ ${item.label} está negativo (R$ ${formatarNumero(item.lucroLiquido)})`,
      });
    }

    for (const item of ranking.filter((item) => item.roiMes < 30)) {
      alertas.push({
        id: `roi-${item.userId}`,
        tipo: "atencao",
        texto: `⚠️ ${item.label} com ROI baixo (${formatarNumero(item.roiMes)}%)`,
      });
    }

    return alertas;
  }, [roleUsuario, ranking]);

  const resumoProprio = totaisPorEscopo.proprio;
  const resumoEquipe = totaisPorEscopo.equipe;
  const resumoConsolidado = totaisPorEscopo.consolidado;
  const resumoPorOperacao = roleUsuario === "admin" ? resumoPorOperacaoAdmin : resumoPorOperacaoReal;

  const fraseMotivacional = useMemo(() => {
    const seed = resumoProprio.roiMes + mesSelecionado + anoSelecionado + operacoes.length;
    return getFraseAleatoria(FRASES_ROI_ALTO, seed);
  }, [resumoProprio.roiMes, mesSelecionado, anoSelecionado, operacoes.length]);

  const fraseAtencao = useMemo(() => {
    const seed =
      resumoProprio.roiMes + mesSelecionado + anoSelecionado + operacoes.length + 17;
    return getFraseAleatoria(FRASES_ROI_BAIXO, seed);
  }, [resumoProprio.roiMes, mesSelecionado, anoSelecionado, operacoes.length]);

  function renderKpiGrid(
    resumo: ResumoKpi,
    titulo: string,
    options?: {
      esconderRepasseLiquido?: boolean;
      esconderLucroLiquido?: boolean;
      esconderRepasseTotal?: boolean;
      aplicarDespesasNoRepasseTotal?: boolean;
    }
  ) {
    const esconderRepasseLiquido = options?.esconderRepasseLiquido ?? false;
    const esconderLucroLiquido = options?.esconderLucroLiquido ?? false;
    const esconderRepasseTotal = options?.esconderRepasseTotal ?? false;
    const aplicarDespesasNoRepasseTotal = options?.aplicarDespesasNoRepasseTotal ?? false;
    const repasseTotalExibido = aplicarDespesasNoRepasseTotal
      ? resumo.repasseTotal - resumo.descontoDespesas
      : resumo.repasseTotal;
    const totalCardsVisiveis =
      3 +
      (esconderLucroLiquido ? 0 : 1) +
      (esconderRepasseTotal ? 0 : 1) +
      (esconderRepasseLiquido ? 0 : 1);
    const classeGridXL =
      totalCardsVisiveis <= 3
        ? "xl:grid-cols-3"
        : totalCardsVisiveis === 4
        ? "xl:grid-cols-4"
        : totalCardsVisiveis === 5
        ? "xl:grid-cols-5"
        : "xl:grid-cols-6";

    return (
      <section className="mt-4 md:mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 md:text-sm md:tracking-[0.12em]">
          {titulo}
        </p>
        <div className={`grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 ${classeGridXL}`}>
          <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-red-500 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Custo Total</p>
            <p className="mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none text-red-600 sm:text-xl md:text-2xl lg:text-3xl">
              R$ {formatarNumero(resumo.custoTotal)}
            </p>
          </div>
          <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-yellow-400 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Receita Total</p>
            <p className="mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none text-blue-600 sm:text-xl md:text-2xl lg:text-3xl">
              R$ {formatarNumero(resumo.receitaTotal)}
            </p>
          </div>
          {!esconderLucroLiquido && (
            <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-blue-500 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
              <p className="text-xs font-semibold text-slate-400 md:text-sm">Lucro Líquido</p>
              <p className="mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none text-green-600 sm:text-xl md:text-2xl lg:text-3xl">
                R$ {formatarNumero(resumo.lucroLiquido)}
              </p>
            </div>
          )}
          <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">ROI do Mês</p>
            <p
              className={`mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none sm:text-xl md:text-2xl lg:text-3xl ${getCorPorValor(
                resumo.roiMes
              )}`}
            >
              {formatarNumero(resumo.roiMes)}%
            </p>
          </div>
          {!esconderRepasseTotal && (
            <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
              <p className="text-xs font-semibold text-slate-400 md:text-sm">Repasse Total</p>
              <p
                className={`mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none sm:text-xl md:text-2xl lg:text-3xl ${getCorPorValor(
                  repasseTotalExibido
                )}`}
              >
                R$ {formatarNumero(repasseTotalExibido)}
              </p>
            </div>
          )}
          {!esconderRepasseLiquido && (
            <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-3 shadow-sm md:p-5">
              <p className="text-xs font-semibold text-slate-400 md:text-sm">Repasse Líquido</p>
              <p
                className={`mt-2 whitespace-nowrap tracking-tight text-lg font-extrabold leading-none sm:text-xl md:text-2xl lg:text-3xl ${getCorPorValor(
                  resumo.repasseLiquidoFinal
                )}`}
              >
                R$ {formatarNumero(resumo.repasseLiquidoFinal)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500 md:text-xs">
                já com o débito das despesas
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <section className="mx-auto w-full max-w-7xl">
        <header className="relative flex flex-col items-center gap-3">
          <div className="flex w-full justify-center">
            <Image
              src="/uptime-v2.png"
              alt="Uptime"
              width={300}
              height={72}
              className="h-auto w-[190px] md:w-[240px] xl:w-[300px]"
              priority
            />
          </div>
          <p className="text-center text-sm text-slate-400 md:text-lg">
            Visão geral consolidada do mês
          </p>

        </header>

        <section className="mt-4 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-3 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:mt-6 md:p-6">
          <div
            className={
              roleUsuario === "admin" || roleUsuario === "gestor" || roleUsuario === "auxiliar"
                ? "grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-center"
                : "flex flex-col gap-3"
            }
          >
            <div className="flex w-full justify-center">
              <div className="flex w-full flex-col items-center gap-2 md:w-auto md:flex-row md:flex-nowrap md:items-center md:gap-3">
              <div className="relative w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setPeriodoAberto((prev) => !prev)}
                  className="min-h-[40px] w-full whitespace-nowrap rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-2 text-center text-sm font-semibold text-slate-100 md:w-auto md:px-5 md:py-3 md:text-base"
                >
                  <span>Período: {MESES.find((m) => m.valor === mesSelecionado)?.label}/{anoSelecionado}</span>
                </button>

                {periodoAberto && (
                  <div className="absolute left-0 top-full z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1222] p-2 shadow-xl sm:w-56">
                    {periodosDisponiveis.map((periodo) => (
                      <button
                        key={`${periodo.mes}-${periodo.ano}`}
                        type="button"
                        onClick={() => {
                          setMesSelecionado(periodo.mes);
                          setAnoSelecionado(periodo.ano);
                          setPeriodoAberto(false);
                        }}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                          periodo.mes === mesSelecionado && periodo.ano === anoSelecionado
                            ? "bg-cyan-500 text-white"
                            : "text-slate-100 hover:bg-white/10"
                        }`}
                      >
                        {periodo.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col items-center gap-1.5 md:w-auto md:flex-row md:flex-nowrap md:items-center md:gap-3">
                <button
                  type="button"
                  onClick={() => setModoTemporal("periodo")}
                  className={`min-h-[40px] w-full whitespace-nowrap rounded-2xl border px-4 py-2 text-center text-sm font-semibold transition md:w-auto ${
                    modoTemporal === "periodo"
                      ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                      : "border-white/20 bg-[#0b1222] text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Período inteiro
                </button>
                <button
                  type="button"
                  onClick={() => setModoTemporal("ontem")}
                  className={`min-h-[40px] w-full whitespace-nowrap rounded-2xl border px-4 py-2 text-center text-sm font-semibold transition md:w-auto ${
                    modoTemporal === "ontem"
                      ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                      : "border-white/20 bg-[#0b1222] text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Ontem
                </button>
                <button
                  type="button"
                  onClick={() => setModoTemporal("hoje")}
                  className={`min-h-[40px] w-full whitespace-nowrap rounded-2xl border px-4 py-2 text-center text-sm font-semibold transition md:w-auto ${
                    modoTemporal === "hoje"
                      ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                      : "border-white/20 bg-[#0b1222] text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Hoje até o momento
                </button>
              </div>
            </div>
            </div>

            {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && (
              <div className="w-full md:w-auto md:justify-self-end">
                <button
                  type="button"
                  onClick={() => setKpisAbertos((prev) => !prev)}
                  className="min-h-[40px] w-full rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-2 text-center text-sm font-semibold text-slate-100 transition hover:bg-white/10 md:w-auto md:px-5 md:py-3 md:text-base"
                >
                  📊 {kpisAbertos ? "Ocultar resumo de operação" : "Ver resumo de operação"}
                </button>
              </div>
            )}
          </div>

          {modoTemporal !== "periodo" && contextoTemporal.foraDoMesAtual && (
            <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              O modo selecionado usa a data atual. Como o período não é o mês atual, os cards ficam
              zerados.
            </div>
          )}

          {!!mensagem && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {mensagem}
            </div>
          )}

          {!!erro && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          {carregando && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Atualizando dados do período...
            </div>
          )}

        </section>

        {roleUsuario === "admin" && (
          <>
            {renderKpiGrid(resumoProprio, "OPERAÇÕES PRÓPRIAS", {
              esconderRepasseLiquido: true,
              aplicarDespesasNoRepasseTotal: true,
            })}
          </>
        )}

        {roleUsuario === "dono" && (
          <section className="mt-6 rounded-[24px] card-white-modern p-4 shadow-sm md:p-6">
            <button
              type="button"
              onClick={() => setKpisAbertos((prev) => !prev)}
              className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-50 md:px-5 md:text-base"
            >
              📊 {kpisAbertos ? "Ocultar resumo" : "Ver resumo"}
            </button>

            {kpisAbertos && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Resumo — {(nomeMesSelecionado || "").slice(0, 3)}/{anoSelecionado}
                </p>
                {renderKpiGrid(resumoProprio, "OPERAÇÕES PRÓPRIAS")}
                {renderKpiGrid(resumoEquipe, "KPIs da equipe")}
                {renderKpiGrid(resumoConsolidado, "KPIs consolidados")}
              </>
            )}
          </section>
        )}

        {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && (
          <>
            {renderKpiGrid(resumoProprio, "OPERAÇÕES PRÓPRIAS", {
              esconderLucroLiquido: roleUsuario === "auxiliar",
              esconderRepasseTotal: roleUsuario === "auxiliar",
              esconderRepasseLiquido: roleUsuario === "auxiliar",
            })}
            {kpisAbertos && (
              <section className="mt-6 rounded-[24px] card-white-modern p-4 shadow-sm md:p-6">
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Resumo — {(nomeMesSelecionado || "").slice(0, 3)}/{anoSelecionado}
                </p>
                <div className="mt-4 space-y-3">
                  {operacoes.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                      Nenhuma operação encontrada no período.
                    </div>
                  )}

                  {operacoes.map((operacao) => {
                    const resumo = resumoPorOperacao.get(operacao.id) || {
                      custo: 0,
                      receita: 0,
                      lucro: 0,
                      roi: 0,
                      repasse: 0,
                      repasseLiquido: 0,
                    };

                    return (
                      <article
                        key={operacao.id}
                        className="rounded-2xl border border-gray-200 card-white-modern p-4 shadow-sm"
                      >
                        <h3 className="text-base font-bold text-black md:text-lg">
                          {operacao.nome}
                        </h3>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                          <div className="rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Receita</p>
                            <p className="whitespace-nowrap text-sm font-extrabold text-blue-600">
                              R$ {formatarNumero(resumo.receita)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Custo</p>
                            <p className="whitespace-nowrap text-sm font-extrabold text-red-600">
                              R$ {formatarNumero(resumo.custo)}
                            </p>
                          </div>

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Lucro</p>
                              <p className={`whitespace-nowrap text-sm font-extrabold ${getCorPorValor(resumo.lucro)}`}>
                                R$ {formatarNumero(resumo.lucro)}
                              </p>
                            </div>
                          )}

                          <div className="rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">ROI</p>
                            <p className={`whitespace-nowrap text-sm font-extrabold ${getCorPorValor(resumo.roi)}`}>
                              {formatarNumero(resumo.roi)}%
                            </p>
                          </div>

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Repasse</p>
                              <p className={`whitespace-nowrap text-sm font-extrabold ${getCorPorValor(resumo.repasse)}`}>
                                R$ {formatarNumero(resumo.repasse)}
                              </p>
                            </div>
                          )}

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Repasse líquido</p>
                              <p
                                className={`whitespace-nowrap text-sm font-extrabold ${getCorPorValor(
                                  resumo.repasseLiquido
                                )}`}
                              >
                                R$ {formatarNumero(resumo.repasseLiquido)}
                              </p>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {(roleUsuario === "admin" || roleUsuario === "dono") && alertasPerformanceHome.length > 0 && (
          <section className="mt-4 rounded-[24px] border border-white/10 bg-[#0f172a]/70 p-3 shadow-[0_20px_45px_rgba(2,6,23,0.45)] md:mt-6 md:p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Alertas rápidos
            </p>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-2">
            {alertasPerformanceHome.map((alerta) => (
              <div
                key={alerta.id}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold md:px-4 md:py-3 md:text-sm ${
                  alerta.tipo === "negativo"
                    ? "border-red-300/50 bg-red-500/10 text-red-200"
                    : alerta.tipo === "atencao"
                    ? "border-yellow-300/50 bg-yellow-500/10 text-yellow-200"
                    : "border-green-300/50 bg-green-500/10 text-green-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="pt-0.5">
                    {alerta.tipo === "negativo" ? "⛔" : alerta.tipo === "atencao" ? "⚠️" : "✅"}
                  </span>
                  <span>{alerta.texto.replace(/^⚠️\s*/, "")}</span>
                </div>
              </div>
            ))}
            </div>
          </section>
        )}

        {(roleUsuario === "admin" || roleUsuario === "dono") && (
          <section className="mt-4 rounded-[24px] card-white-modern p-3 shadow-sm md:mt-6 md:p-6">
            <div className="flex items-center justify-between gap-2 md:gap-3">
              <h2 className="text-base font-extrabold text-black md:text-2xl">
                {roleUsuario === "admin" ? "RANKING GERAL" : "Ranking de admins"}
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400 md:text-xs md:tracking-[0.12em]">
                Ordenado por repasse bruto
              </span>
            </div>

            <div className="mt-3 space-y-1.5 md:mt-4 md:space-y-2">
              {ranking.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  Nenhum dado disponível para o ranking neste período.
                </div>
              )}

              {ranking.length > 0 && (
                <div className="hidden rounded-xl px-4 pb-1 md:grid md:grid-cols-3 md:items-center md:gap-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Nome
                  </p>
                  <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Repasse bruto
                  </p>
                  <p className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    ROI e operações
                  </p>
                </div>
              )}

              {ranking.map((item, index) => (
                <div
                  key={item.userId}
                  className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:grid md:grid-cols-3 md:items-center md:gap-4 md:px-4 md:py-3"
                >
                  <div className="flex items-center gap-3 md:min-w-0">
                    {index === 0 ? (
                      <span
                        className="inline-flex min-w-8 items-center justify-center text-xl leading-none"
                        title="1º lugar"
                        aria-label="1º lugar"
                      >
                        🥇
                      </span>
                    ) : index === 1 ? (
                      <span
                        className="inline-flex min-w-8 items-center justify-center text-xl leading-none"
                        title="2º lugar"
                        aria-label="2º lugar"
                      >
                        🥈
                      </span>
                    ) : index === 2 ? (
                      <span
                        className="inline-flex min-w-8 items-center justify-center text-xl leading-none"
                        title="3º lugar"
                        aria-label="3º lugar"
                      >
                        🥉
                      </span>
                    ) : (
                      <span className="inline-flex min-w-8 items-center justify-center text-base font-extrabold text-slate-700">
                        {index + 1}
                      </span>
                    )}
                    <UserAvatar
                      nome={item.nome}
                      email={item.email}
                      size="sm"
                    />
                    <p className="truncate text-xs font-semibold text-black md:text-base">{item.label}</p>
                  </div>

                  <p
                    className={`mt-1 whitespace-nowrap text-xs font-extrabold md:mt-0 md:justify-self-center md:text-center md:text-base ${
                      item.repasseBruto >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    R$ {formatarNumero(item.repasseBruto)}
                  </p>
                  <p className="whitespace-nowrap text-[11px] text-gray-500 md:justify-self-end md:text-right md:text-sm">
                    ROI {formatarNumero(item.roiMes)}% • {item.operacoesCount} operações
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && resumoProprio.roiMes > 60 && (
          <section className="mt-8 rounded-[24px] border border-emerald-400/30 bg-[#0b1222]/90 p-5 shadow-[0_12px_30px_rgba(16,185,129,0.14),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]" />
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                  Performance de elite
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-200 md:text-base">
                  {fraseMotivacional}
                </p>
              </div>
            </div>
          </section>
        )}

        {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && resumoProprio.roiMes < 30 && (
          <section className="mt-8 rounded-[24px] border border-amber-300/30 bg-[#0b1222]/90 p-5 shadow-[0_12px_30px_rgba(245,158,11,0.14),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_0_6px_rgba(245,158,11,0.18)]" />
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-300">
                  Atenção na operação
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-200 md:text-base">
                  {fraseAtencao}
                </p>
              </div>
            </div>
          </section>
        )}

      </section>
    </main>
  );
}
