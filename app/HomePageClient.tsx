"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcularBaseComissaoAuxiliarConvidador,
  calcularTotalComissoesAuxiliares,
  type AuxiliarComissaoAtiva,
} from "../lib/comissao/calcularTotalComissoesAuxiliares";
import { createClient } from "../lib/supabase/client";
import {
  aplicarOverrideAdminNaOperacaoDashboard,
  calcularResumoDashboardOperacao,
  getRepassePercentualDashboardComOverride,
} from "../lib/dashboard/calcularResumoDashboardOperacao";
import {
  formatarDiaMesAno,
  formatarMesAnoCurto,
  getDiasNoMes,
  getMesAnoFromSearchParams,
  getNomeMes,
  getPartesDaData,
  limitarDiaAoMes,
} from "../lib/periodo";
import ResponsiveMetricValue from "./components/ResponsiveMetricValue";
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

type ModoTemporalDashboard = "periodo" | "ontem" | "hoje" | "calendario";
type ComissaoAuxiliarDashboard = {
  temConfiguracao: boolean;
  comissaoAtual: number | null;
};

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

function formatarInputData(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function parseInputData(valor: string) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  return {
    ano: Number.isFinite(ano) ? ano : 0,
    mes: Number.isFinite(mes) ? mes : 0,
    dia: Number.isFinite(dia) ? dia : 0,
  };
}

function isModoTemporalDashboard(valor: string | null): valor is ModoTemporalDashboard {
  return valor === "periodo" || valor === "hoje" || valor === "ontem" || valor === "calendario";
}

export default function HomePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const hoje = useMemo(() => new Date(), []);
  const periodoInicial = useMemo(() => getMesAnoFromSearchParams(searchParams, hoje), [searchParams, hoje]);
  const modoTemporalInicial = useMemo<ModoTemporalDashboard>(() => {
    const modoParam = searchParams.get("modo");
    return isModoTemporalDashboard(modoParam) ? modoParam : "periodo";
  }, [searchParams]);
  const dataPadraoHoje = useMemo(
    () => formatarInputData(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()),
    [hoje]
  );
  const [mesSelecionado, setMesSelecionado] = useState(periodoInicial.mes);
  const [anoSelecionado, setAnoSelecionado] = useState(periodoInicial.ano);
  const [dataInicioSelecionada, setDataInicioSelecionada] = useState(
    searchParams.get("inicio") || dataPadraoHoje
  );
  const [dataFimSelecionada, setDataFimSelecionada] = useState(
    searchParams.get("fim") || dataPadraoHoje
  );

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
  const [comissoesAuxiliaresAtivas, setComissoesAuxiliaresAtivas] = useState<AuxiliarComissaoAtiva[]>(
    []
  );
  const [comissaoAuxiliarAtual, setComissaoAuxiliarAtual] = useState<ComissaoAuxiliarDashboard | null>(
    null
  );
  const [kpisAbertos, setKpisAbertos] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("home_kpis_abertos") === "1";
    } catch {
      return false;
    }
  });
  const [modoTemporal, setModoTemporal] = useState<ModoTemporalDashboard>(modoTemporalInicial);
  const [seletorTemporalAberto, setSeletorTemporalAberto] = useState(false);
  const [rankingAberto, setRankingAberto] = useState(false);

  useEffect(() => {
    setMesSelecionado(periodoInicial.mes);
    setAnoSelecionado(periodoInicial.ano);
  }, [periodoInicial]);

  useEffect(() => {
    setModoTemporal(modoTemporalInicial);
    setDataInicioSelecionada(searchParams.get("inicio") || dataPadraoHoje);
    setDataFimSelecionada(searchParams.get("fim") || dataPadraoHoje);
  }, [modoTemporalInicial, searchParams, dataPadraoHoje]);

  const atualizarContextoTemporalNaUrl = useCallback(
    (proximo: {
      mes?: number;
      ano?: number;
      modo?: ModoTemporalDashboard;
      inicio?: string;
      fim?: string;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const mes = proximo.mes ?? mesSelecionado;
      const ano = proximo.ano ?? anoSelecionado;
      const modo = proximo.modo ?? modoTemporal;
      const inicio = proximo.inicio ?? dataInicioSelecionada;
      const fim = proximo.fim ?? dataFimSelecionada;

      params.set("mes", String(mes));
      params.set("ano", String(ano));
      params.set("modo", modo);

      if (modo === "calendario") {
        params.set("inicio", inicio);
        params.set("fim", fim);
      } else {
        params.delete("inicio");
        params.delete("fim");
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [
      anoSelecionado,
      dataFimSelecionada,
      dataInicioSelecionada,
      mesSelecionado,
      modoTemporal,
      pathname,
      router,
      searchParams,
    ]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem("home_kpis_abertos", kpisAbertos ? "1" : "0");
    } catch {}
  }, [kpisAbertos]);

  const anosDisponiveis = useMemo(() => {
    const anoBase = hoje.getFullYear();
    return Array.from({ length: 4 }, (_, indice) => anoBase - 1 + indice);
  }, [hoje]);
  const dataMinimaMesSelecionado = useMemo(
    () => formatarInputData(anoSelecionado, mesSelecionado, 1),
    [anoSelecionado, mesSelecionado]
  );
  const dataMaximaMesSelecionado = useMemo(
    () => formatarInputData(anoSelecionado, mesSelecionado, getDiasNoMes(mesSelecionado, anoSelecionado)),
    [anoSelecionado, mesSelecionado]
  );

  useEffect(() => {
    const diaInicioAtual = limitarDiaAoMes(
      parseInputData(dataInicioSelecionada).dia || 1,
      mesSelecionado,
      anoSelecionado
    );
    const diaFimAtual = limitarDiaAoMes(
      parseInputData(dataFimSelecionada).dia || diaInicioAtual,
      mesSelecionado,
      anoSelecionado
    );

    const timeoutId = window.setTimeout(() => {
      setDataInicioSelecionada(formatarInputData(anoSelecionado, mesSelecionado, diaInicioAtual));
      setDataFimSelecionada(
        formatarInputData(anoSelecionado, mesSelecionado, Math.max(diaInicioAtual, diaFimAtual))
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [anoSelecionado, mesSelecionado, dataInicioSelecionada, dataFimSelecionada]);

  const contextoTemporal = useMemo(() => {
    if (modoTemporal === "periodo") {
      return {
        mesConsulta: mesSelecionado,
        anoConsulta: anoSelecionado,
        diaInicial: 1,
        diaFinal: getDiasNoMes(mesSelecionado, anoSelecionado),
        usaDespesas: true,
        labelResumo: `Mês inteiro · ${formatarMesAnoCurto(mesSelecionado, anoSelecionado)}`,
        labelBotao: `Mês: ${formatarMesAnoCurto(mesSelecionado, anoSelecionado)}`,
      };
    }

    if (modoTemporal === "hoje") {
      const partesHoje = getPartesDaData(new Date());
      return {
        mesConsulta: partesHoje.mes,
        anoConsulta: partesHoje.ano,
        diaInicial: partesHoje.dia,
        diaFinal: partesHoje.dia,
        usaDespesas: false,
        labelResumo: `Hoje · ${formatarDiaMesAno(partesHoje.dia, partesHoje.mes, partesHoje.ano)}`,
        labelBotao: "Hoje",
      };
    }

    if (modoTemporal === "ontem") {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const partesOntem = getPartesDaData(ontem);
      return {
        mesConsulta: partesOntem.mes,
        anoConsulta: partesOntem.ano,
        diaInicial: partesOntem.dia,
        diaFinal: partesOntem.dia,
        usaDespesas: false,
        labelResumo: `Ontem · ${formatarDiaMesAno(partesOntem.dia, partesOntem.mes, partesOntem.ano)}`,
        labelBotao: "Ontem",
      };
    }

    const partesInicio = parseInputData(dataInicioSelecionada);
    const partesFim = parseInputData(dataFimSelecionada);
    const diaInicialNormalizado = limitarDiaAoMes(
      partesInicio.dia || 1,
      mesSelecionado,
      anoSelecionado
    );
    const diaFinalNormalizado = limitarDiaAoMes(
      Math.max(partesFim.dia || diaInicialNormalizado, diaInicialNormalizado),
      mesSelecionado,
      anoSelecionado
    );
    const ehDiaUnico = diaInicialNormalizado === diaFinalNormalizado;

    return {
      mesConsulta: mesSelecionado,
      anoConsulta: anoSelecionado,
      diaInicial: diaInicialNormalizado,
      diaFinal: diaFinalNormalizado,
      usaDespesas: false,
      labelResumo: ehDiaUnico
        ? `Dia · ${formatarDiaMesAno(diaInicialNormalizado, mesSelecionado, anoSelecionado)}`
        : `Período · ${formatarDiaMesAno(
            diaInicialNormalizado,
            mesSelecionado,
            anoSelecionado
          )} a ${formatarDiaMesAno(diaFinalNormalizado, mesSelecionado, anoSelecionado)}`,
      labelBotao: ehDiaUnico
        ? `Dia: ${formatarDiaMesAno(diaInicialNormalizado, mesSelecionado, anoSelecionado)}`
        : `${String(diaInicialNormalizado).padStart(2, "0")}/${String(
            mesSelecionado
          ).padStart(2, "0")} até ${String(diaFinalNormalizado).padStart(2, "0")}/${String(
            mesSelecionado
          ).padStart(2, "0")}`,
    };
  }, [
    modoTemporal,
    mesSelecionado,
    anoSelecionado,
    dataInicioSelecionada,
    dataFimSelecionada,
  ]);

  useEffect(() => {
    if (roleUsuario !== "auxiliar" || !userIdAtual) {
      return;
    }

    let cancelado = false;

    async function carregarComissaoAuxiliar() {
      try {
        const response = await fetch(
          `/api/dashboard/auxiliar-comissao?mes=${contextoTemporal.mesConsulta}&ano=${contextoTemporal.anoConsulta}`,
          { method: "GET" }
        );
        const data = await response.json();

        if (!response.ok || !data?.success) {
          if (!cancelado) {
            setComissaoAuxiliarAtual(null);
          }
          return;
        }

        if (!cancelado) {
          setComissaoAuxiliarAtual(
            {
              temConfiguracao: Boolean(data.temConfiguracao),
              comissaoAtual:
                typeof data.comissaoAtual === "number" ? data.comissaoAtual : null,
            }
          );
        }
      } catch {
        if (!cancelado) {
          setComissaoAuxiliarAtual(null);
        }
      }
    }

    void carregarComissaoAuxiliar();

    return () => {
      cancelado = true;
    };
  }, [roleUsuario, userIdAtual, contextoTemporal.mesConsulta, contextoTemporal.anoConsulta]);

  const lancamentosFiltradosTemporal = useMemo(() => {
    if (modoTemporal === "periodo") return lancamentos;
    return lancamentos.filter(
      (item) => item.dia >= contextoTemporal.diaInicial && item.dia <= contextoTemporal.diaFinal
    );
  }, [lancamentos, modoTemporal, contextoTemporal.diaInicial, contextoTemporal.diaFinal]);

  const despesasAplicadasTemporal = useMemo(() => {
    return contextoTemporal.usaDespesas ? despesas : [];
  }, [contextoTemporal.usaDespesas, despesas]);

  const carregarDados = useCallback(async () => {
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
      setComissaoAuxiliarAtual(null);
      setGestoresVinculadosIds([]);
      setAdminIdsSistema([]);
      setComissoesAuxiliaresAtivas([]);
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

    setRoleUsuario(roleAtual);
    if (roleAtual !== "auxiliar") {
      setComissaoAuxiliarAtual(null);
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

    if (roleAtual === "admin" || roleAtual === "gestor") {
      const { data: comissoesData, error: comissoesError } = await supabase
        .from("auxiliar_comissoes")
        .select("id, auxiliar_user_id, percentual_comissao, percentual_desconto")
        .eq("convidador_user_id", user.id)
        .eq("ativo", true)
        .eq("mes", contextoTemporal.mesConsulta)
        .eq("ano", contextoTemporal.anoConsulta)
        .not("percentual_comissao", "is", null);

      if (comissoesError) {
        setErro(`Erro ao carregar comissões dos auxiliares: ${JSON.stringify(comissoesError)}`);
        setCarregando(false);
        return;
      }

      const comissoesLista = (comissoesData as AuxiliarComissaoAtiva[]) || [];

      if (comissoesLista.length > 0) {
        const { data: despesasExtrasData, error: despesasExtrasError } = await supabase
          .from("auxiliar_comissao_despesas_extras")
          .select("auxiliar_comissao_id, valor")
          .in(
            "auxiliar_comissao_id",
            comissoesLista.map((item) => item.id)
          )
          .eq("mes", contextoTemporal.mesConsulta)
          .eq("ano", contextoTemporal.anoConsulta);

        if (despesasExtrasError) {
          setErro(
            `Erro ao carregar despesas extras das comissões: ${JSON.stringify(
              despesasExtrasError
            )}`
          );
          setCarregando(false);
          return;
        }

        const totaisPorComissaoId = new Map<string, number>();
        for (const despesa of
          ((despesasExtrasData as Array<{
            auxiliar_comissao_id: string | null;
            valor: number | null;
          }>) || [])) {
          if (!despesa.auxiliar_comissao_id) continue;
          totaisPorComissaoId.set(
            despesa.auxiliar_comissao_id,
            (totaisPorComissaoId.get(despesa.auxiliar_comissao_id) || 0) + Number(despesa.valor ?? 0)
          );
        }

        setComissoesAuxiliaresAtivas(
          comissoesLista.map((comissao) => ({
            ...comissao,
            total_despesas_extras: totaisPorComissaoId.get(comissao.id) || 0,
          }))
        );
      } else {
        setComissoesAuxiliaresAtivas([]);
      }
    } else {
      setComissoesAuxiliaresAtivas([]);
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
          .eq("mes", contextoTemporal.mesConsulta)
          .eq("ano", contextoTemporal.anoConsulta)
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
        .eq("mes", contextoTemporal.mesConsulta)
        .eq("ano", contextoTemporal.anoConsulta)
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
      .eq("mes", contextoTemporal.mesConsulta)
      .eq("ano", contextoTemporal.anoConsulta)
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
  }, [contextoTemporal.mesConsulta, contextoTemporal.anoConsulta, supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void carregarDados();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [carregarDados]);

  const resumoPorOperacaoReal = useMemo(() => {
    const mapa = new Map<number, ResumoOperacao>();

    for (const operacao of operacoes) {
      const lancamentosDaOperacao = lancamentosFiltradosTemporal.filter(
        (item) => item.operacao_id === operacao.id
      );

      mapa.set(operacao.id, calcularResumoDashboardOperacao(operacao, lancamentosDaOperacao));
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
      const operacaoParaCalculo = aplicarOverrideAdminNaOperacaoDashboard(operacao, override);
      const repassePercentual = getRepassePercentualDashboardComOverride(operacao, override);

      mapa.set(
        operacao.id,
        calcularResumoDashboardOperacao(
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
  const deveDescontarComissoesAuxiliaresNoResumo = modoTemporal === "periodo";
  const baseComissaoAuxiliarConvidador = useMemo(() => {
    if ((roleUsuario !== "admin" && roleUsuario !== "gestor") || !userIdAtual) {
      return 0;
    }

    return calcularBaseComissaoAuxiliarConvidador(
      userIdAtual,
      operacoes,
      lancamentos,
      despesas
    );
  }, [roleUsuario, userIdAtual, operacoes, lancamentos, despesas]);
  const totalComissoesAuxiliaresResumo = useMemo(() => {
    if (roleUsuario !== "admin" && roleUsuario !== "gestor") {
      return {
        totalComissoesAuxiliares: 0,
        comissoesPorAuxiliar: [],
      };
    }

    return calcularTotalComissoesAuxiliares(
      baseComissaoAuxiliarConvidador,
      comissoesAuxiliaresAtivas
    );
  }, [roleUsuario, baseComissaoAuxiliarConvidador, comissoesAuxiliaresAtivas]);

  const fraseMotivacional = useMemo(() => {
    const seed =
      resumoProprio.roiMes +
      contextoTemporal.mesConsulta +
      contextoTemporal.anoConsulta +
      operacoes.length;
    return getFraseAleatoria(FRASES_ROI_ALTO, seed);
  }, [
    resumoProprio.roiMes,
    contextoTemporal.mesConsulta,
    contextoTemporal.anoConsulta,
    operacoes.length,
  ]);

  const fraseAtencao = useMemo(() => {
    const seed =
      resumoProprio.roiMes +
      contextoTemporal.mesConsulta +
      contextoTemporal.anoConsulta +
      operacoes.length +
      17;
    return getFraseAleatoria(FRASES_ROI_BAIXO, seed);
  }, [
    resumoProprio.roiMes,
    contextoTemporal.mesConsulta,
    contextoTemporal.anoConsulta,
    operacoes.length,
  ]);

  function renderKpiGrid(
    resumo: ResumoKpi,
    titulo: string,
    options?: {
      esconderRepasseLiquido?: boolean;
      esconderLucroLiquido?: boolean;
      esconderRepasseTotal?: boolean;
      aplicarDespesasNoRepasseTotal?: boolean;
      descontoComissoesAuxiliares?: number;
      mostrarComissoesAuxiliares?: boolean;
    }
  ) {
    const esconderRepasseLiquido = options?.esconderRepasseLiquido ?? false;
    const esconderLucroLiquido = options?.esconderLucroLiquido ?? false;
    const esconderRepasseTotal = options?.esconderRepasseTotal ?? false;
    const aplicarDespesasNoRepasseTotal = options?.aplicarDespesasNoRepasseTotal ?? false;
    const descontoComissoesAuxiliares = options?.descontoComissoesAuxiliares ?? 0;
    const mostrarComissoesAuxiliares = options?.mostrarComissoesAuxiliares ?? false;
    const repasseTotalBase = aplicarDespesasNoRepasseTotal
      ? resumo.repasseTotal - resumo.descontoDespesas
      : resumo.repasseTotal;
    const repasseTotalExibido = repasseTotalBase - descontoComissoesAuxiliares;
    const totalCardsVisiveis =
      3 +
      (esconderLucroLiquido ? 0 : 1) +
      (mostrarComissoesAuxiliares ? 1 : 0) +
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
      <section className="mt-2 md:mt-6">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 md:mb-2 md:text-sm md:tracking-[0.12em]">
          {titulo}
        </p>
        <div className={`grid grid-cols-2 gap-1 md:gap-3 lg:grid-cols-3 xl:gap-2 ${classeGridXL}`}>
          <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-red-500 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
            <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Custo Total</p>
            <ResponsiveMetricValue
              value={`R$ ${formatarNumero(resumo.custoTotal)}`}
              size="hero"
              className="mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none text-red-600 sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)]"
            />
          </div>
          <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-yellow-400 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
            <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Receita Total</p>
            <ResponsiveMetricValue
              value={`R$ ${formatarNumero(resumo.receitaTotal)}`}
              size="hero"
              className="mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none text-blue-600 sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)]"
            />
          </div>
          {!esconderLucroLiquido && (
            <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-blue-500 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
              <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Lucro Líquido</p>
              <ResponsiveMetricValue
                value={`R$ ${formatarNumero(resumo.lucroLiquido)}`}
                size="hero"
                className="mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none text-green-600 sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)]"
              />
            </div>
          )}
          <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-green-500 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
            <p className="text-[9px] font-semibold text-slate-400 md:text-sm">ROI do período</p>
            <ResponsiveMetricValue
              value={`${formatarNumero(resumo.roiMes)}%`}
              size="hero"
              className={`mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)] ${getCorPorValor(
                resumo.roiMes
              )}`}
            />
          </div>
          {mostrarComissoesAuxiliares && (
            <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-amber-400 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
              <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Comiss&atilde;o Auxs</p>
              <ResponsiveMetricValue
                value={`R$ ${formatarNumero(descontoComissoesAuxiliares)}`}
                size="hero"
                className={`mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)] ${getCorPorValor(
                  -Math.abs(descontoComissoesAuxiliares)
                )}`}
              />
            </div>
          )}
          {!esconderRepasseTotal && (
            <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-green-500 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
              <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Repasse Total</p>
              <ResponsiveMetricValue
                value={`R$ ${formatarNumero(repasseTotalExibido)}`}
                size="hero"
                className={`mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)] ${getCorPorValor(
                  repasseTotalExibido
                )}`}
              />
            </div>
          )}
          {!esconderRepasseLiquido && (
            <div className="min-w-0 overflow-hidden rounded-[12px] border border-white/10 border-l-[3px] border-l-green-500 bg-[#0f172a]/85 px-1.5 py-1 shadow-sm md:rounded-[20px] md:border-l-4 md:px-4 md:py-4">
              <p className="text-[9px] font-semibold text-slate-400 md:text-sm">Repasse Líquido</p>
              <ResponsiveMetricValue
                value={`R$ ${formatarNumero(resumo.repasseLiquidoFinal)}`}
                size="hero"
                className={`mt-0.5 font-black text-[clamp(0.74rem,2.9vw,0.86rem)] leading-none sm:text-[clamp(0.95rem,3vw,1.12rem)] xl:text-[clamp(1.2rem,1.4vw,1.75rem)] ${getCorPorValor(
                  resumo.repasseLiquidoFinal
                )}`}
              />
              <p className="mt-0.5 text-[8px] text-slate-500 md:text-xs">
                {contextoTemporal.usaDespesas
                  ? "já com o débito das despesas"
                  : "sem débito de despesas neste recorte"}
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent px-2 py-2 md:px-6 md:py-6 xl:px-8">
      <section className="mx-auto w-full max-w-7xl">
        <header className="relative flex flex-col items-center gap-0.5 md:gap-3">
          <div className="flex w-full justify-center">
            <Image
              src="/uptime-v2.png"
              alt="Uptime"
              width={300}
              height={72}
              className="h-auto w-[108px] md:w-[240px] xl:w-[300px]"
              priority
            />
          </div>
          <p className="text-center text-[8px] text-slate-400 md:text-lg">
            Visão geral consolidada do período
          </p>

        </header>

        <section className="mt-0.5 border-0 bg-transparent p-0 shadow-none md:mt-4">
          <div
            className={
              roleUsuario === "admin" || roleUsuario === "gestor" || roleUsuario === "auxiliar"
                ? "grid grid-cols-1 gap-0.5 md:grid-cols-[1fr_auto] md:items-center"
                : "flex flex-col gap-1 md:gap-3"
            }
          >
            <div className="flex w-full justify-center">
              <div className="relative flex w-full max-w-3xl flex-col items-center gap-0 md:gap-3">
                <button
                  type="button"
                  onClick={() => setSeletorTemporalAberto((prev) => !prev)}
                  className="min-h-[20px] w-auto max-w-[120px] rounded-md border border-white/10 bg-[#0b1222] px-2 py-0.5 text-center text-[9px] font-semibold text-slate-100 transition hover:bg-white/10 md:w-auto md:max-w-none md:min-h-[36px] md:min-w-[168px] md:rounded-xl md:border-white/20 md:px-4 md:py-2 md:text-sm"
                >
                  {contextoTemporal.labelBotao}
                </button>

                {seletorTemporalAberto && (
                  <div className="mt-1 w-full rounded-[14px] border border-white/15 bg-[#0b1222] p-1.5 text-left shadow-2xl md:mt-0 md:rounded-[24px] md:p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:text-xs md:tracking-[0.18em]">
                      Período
                    </p>

                    <div className="mt-2 grid gap-1.5 md:grid-cols-2 md:gap-2 xl:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => {
                          setModoTemporal("periodo");
                          atualizarContextoTemporalNaUrl({ modo: "periodo" });
                        }}
                        className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition md:rounded-2xl md:px-4 md:py-3 md:text-sm ${
                          modoTemporal === "periodo"
                            ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                            : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Mês
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModoTemporal("hoje");
                          atualizarContextoTemporalNaUrl({ modo: "hoje" });
                        }}
                        className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition md:rounded-2xl md:px-4 md:py-3 md:text-sm ${
                          modoTemporal === "hoje"
                            ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                            : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModoTemporal("ontem");
                          atualizarContextoTemporalNaUrl({ modo: "ontem" });
                        }}
                        className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition md:rounded-2xl md:px-4 md:py-3 md:text-sm ${
                          modoTemporal === "ontem"
                            ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                            : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Ontem
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModoTemporal("calendario");
                          atualizarContextoTemporalNaUrl({ modo: "calendario" });
                        }}
                        className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition md:rounded-2xl md:px-4 md:py-3 md:text-sm ${
                          modoTemporal === "calendario"
                            ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                            : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Período
                      </button>
                    </div>

                    {(modoTemporal === "periodo" || modoTemporal === "calendario") && (
                      <div className="mt-2 grid gap-2 md:mt-4 md:gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:gap-2 md:text-xs md:tracking-[0.18em]">
                          Ano
                          <select
                            value={anoSelecionado}
                            onChange={(event) => {
                              const proximoAno = Number(event.target.value);
                              setAnoSelecionado(proximoAno);
                              atualizarContextoTemporalNaUrl({ ano: proximoAno });
                            }}
                            className="min-h-[34px] rounded-xl border border-white/20 bg-[#09101d] px-3 py-1.5 text-[12px] font-semibold text-slate-100 md:min-h-[42px] md:rounded-2xl md:px-4 md:py-2 md:text-sm"
                          >
                            {anosDisponiveis.map((ano) => (
                              <option key={ano} value={ano}>
                                {ano}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:gap-2 md:text-xs md:tracking-[0.18em]">
                          Mês
                          <select
                            value={mesSelecionado}
                            onChange={(event) => {
                              const proximoMes = Number(event.target.value);
                              setMesSelecionado(proximoMes);
                              atualizarContextoTemporalNaUrl({ mes: proximoMes });
                            }}
                            className="min-h-[34px] rounded-xl border border-white/20 bg-[#09101d] px-3 py-1.5 text-[12px] font-semibold text-slate-100 md:min-h-[42px] md:rounded-2xl md:px-4 md:py-2 md:text-sm"
                          >
                            {Array.from({ length: 12 }, (_, index) => index + 1).map((mes) => (
                              <option key={mes} value={mes}>
                                {String(mes).padStart(2, "0")} - {getNomeMes(mes)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {modoTemporal === "calendario" && (
                      <div className="mt-2 grid gap-2 md:mt-3 md:gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:gap-2 md:text-xs md:tracking-[0.18em]">
                          Início
                          <input
                            type="date"
                            value={dataInicioSelecionada}
                            min={dataMinimaMesSelecionado}
                            max={dataMaximaMesSelecionado}
                            onChange={(event) => {
                              const proximaDataInicio = event.target.value;
                              setDataInicioSelecionada(proximaDataInicio);
                              if (proximaDataInicio > dataFimSelecionada) {
                                setDataFimSelecionada(proximaDataInicio);
                                atualizarContextoTemporalNaUrl({
                                  inicio: proximaDataInicio,
                                  fim: proximaDataInicio,
                                });
                                return;
                              }
                              atualizarContextoTemporalNaUrl({ inicio: proximaDataInicio });
                            }}
                            className="min-h-[34px] rounded-xl border border-white/20 bg-[#09101d] px-3 py-1.5 text-[12px] font-semibold text-slate-100 md:min-h-[42px] md:rounded-2xl md:px-4 md:py-2 md:text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:gap-2 md:text-xs md:tracking-[0.18em]">
                          Fim
                          <input
                            type="date"
                            value={dataFimSelecionada}
                            min={dataInicioSelecionada}
                            max={dataMaximaMesSelecionado}
                            onChange={(event) => {
                              const proximaDataFim = event.target.value;
                              setDataFimSelecionada(proximaDataFim);
                              if (proximaDataFim < dataInicioSelecionada) {
                                setDataInicioSelecionada(proximaDataFim);
                                atualizarContextoTemporalNaUrl({
                                  inicio: proximaDataFim,
                                  fim: proximaDataFim,
                                });
                                return;
                              }
                              atualizarContextoTemporalNaUrl({ fim: proximaDataFim });
                            }}
                            className="min-h-[34px] rounded-xl border border-white/20 bg-[#09101d] px-3 py-1.5 text-[12px] font-semibold text-slate-100 md:min-h-[42px] md:rounded-2xl md:px-4 md:py-2 md:text-sm"
                          />
                        </label>
                      </div>
                    )}

                    <div className="mt-2 flex flex-col gap-1.5 md:mt-4 md:gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="text-[10px] text-slate-400 md:text-sm">
                        <p>
                          Filtro ativo:{" "}
                          <span className="font-semibold text-slate-200">
                            {contextoTemporal.labelResumo}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSeletorTemporalAberto(false)}
                        className="min-h-[34px] rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-500/25 md:min-h-[40px] md:rounded-2xl md:px-4 md:py-2 md:text-sm"
                      >
                        Aplicar período
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && (
              <div className="w-full md:w-auto md:justify-self-end">
                <button
                  type="button"
                  onClick={() => setKpisAbertos((prev) => !prev)}
                  className="min-h-[34px] w-full rounded-xl border border-white/20 bg-[#0b1222] px-3 py-1.5 text-center text-[12px] font-semibold text-slate-100 transition hover:bg-white/10 md:min-h-[40px] md:w-auto md:rounded-2xl md:px-5 md:py-3 md:text-base"
                >
                  📊 {kpisAbertos ? "Ocultar resumo de operação" : "Ver resumo de operação"}
                </button>
              </div>
            )}
          </div>

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
              descontoComissoesAuxiliares: deveDescontarComissoesAuxiliaresNoResumo
                ? totalComissoesAuxiliaresResumo.totalComissoesAuxiliares
                : 0,
              mostrarComissoesAuxiliares: deveDescontarComissoesAuxiliaresNoResumo,
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
                  Resumo — {contextoTemporal.labelResumo}
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
              descontoComissoesAuxiliares:
                roleUsuario === "gestor" && deveDescontarComissoesAuxiliaresNoResumo
                  ? totalComissoesAuxiliaresResumo.totalComissoesAuxiliares
                  : 0,
              mostrarComissoesAuxiliares:
                roleUsuario === "gestor" && deveDescontarComissoesAuxiliaresNoResumo,
            })}
            {roleUsuario === "auxiliar" && comissaoAuxiliarAtual?.temConfiguracao && (
              <section className="mt-6 rounded-[24px] border border-emerald-300/40 bg-gradient-to-br from-emerald-500/12 via-[#0f172a] to-teal-500/12 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.45)] md:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                  Comissão do mês atual
                </p>
                <p className="mt-3 text-3xl font-black text-slate-100 md:text-4xl">
                  R$ {formatarNumero(comissaoAuxiliarAtual.comissaoAtual ?? 0)}
                </p>
              </section>
            )}
            {kpisAbertos && (
              <section className="mt-6 rounded-[24px] card-white-modern p-4 shadow-sm md:p-6">
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Resumo — {contextoTemporal.labelResumo}
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
                            <ResponsiveMetricValue
                              value={`R$ ${formatarNumero(resumo.receita)}`}
                              size="compact"
                              className="text-blue-600"
                            />
                          </div>

                          <div className="rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Custo</p>
                            <ResponsiveMetricValue
                              value={`R$ ${formatarNumero(resumo.custo)}`}
                              size="compact"
                              className="text-red-600"
                            />
                          </div>

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Lucro</p>
                              <ResponsiveMetricValue
                                value={`R$ ${formatarNumero(resumo.lucro)}`}
                                size="compact"
                                className={getCorPorValor(resumo.lucro)}
                              />
                            </div>
                          )}

                          <div className="rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">ROI</p>
                            <ResponsiveMetricValue
                              value={`${formatarNumero(resumo.roi)}%`}
                              size="compact"
                              className={getCorPorValor(resumo.roi)}
                            />
                          </div>

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Repasse</p>
                              <ResponsiveMetricValue
                                value={`R$ ${formatarNumero(resumo.repasse)}`}
                                size="compact"
                                className={getCorPorValor(resumo.repasse)}
                              />
                            </div>
                          )}

                          {roleUsuario !== "auxiliar" && (
                            <div className="rounded-xl bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Repasse líquido</p>
                              <ResponsiveMetricValue
                                value={`R$ ${formatarNumero(resumo.repasseLiquido)}`}
                                size="compact"
                                className={getCorPorValor(resumo.repasseLiquido)}
                              />
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
          <section className="mt-3 rounded-[18px] card-white-modern p-2.5 shadow-sm md:mt-6 md:rounded-[24px] md:p-6">
            <button
              type="button"
              onClick={() => setRankingAberto((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg text-left transition hover:bg-black/5"
            >
              <div className="min-w-0">
                <h2 className="text-[13px] font-extrabold text-black md:text-2xl">
                  {roleUsuario === "admin" ? "RANKING GERAL" : "Ranking de admins"}
                </h2>
                <span className="block text-[8px] font-semibold uppercase tracking-[0.06em] text-gray-400 md:text-xs md:tracking-[0.12em]">
                  Ordenado por repasse bruto
                </span>
              </div>
              <span
                className={`shrink-0 text-[11px] font-bold text-slate-500 transition-transform md:text-sm ${
                  rankingAberto ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>

            <div className={rankingAberto ? "mt-2 space-y-0.5 md:mt-4 md:space-y-2" : "hidden"}>
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
                  className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 md:rounded-xl md:grid md:grid-cols-3 md:items-center md:gap-4 md:px-4 md:py-3"
                >
                  <div className="flex items-center gap-2 md:min-w-0">
                    {index === 0 ? (
                      <span
                        className="inline-flex min-w-6 items-center justify-center text-base leading-none md:min-w-8 md:text-xl"
                        title="1º lugar"
                        aria-label="1º lugar"
                      >
                        🥇
                      </span>
                    ) : index === 1 ? (
                      <span
                        className="inline-flex min-w-6 items-center justify-center text-base leading-none md:min-w-8 md:text-xl"
                        title="2º lugar"
                        aria-label="2º lugar"
                      >
                        🥈
                      </span>
                    ) : index === 2 ? (
                      <span
                        className="inline-flex min-w-6 items-center justify-center text-base leading-none md:min-w-8 md:text-xl"
                        title="3º lugar"
                        aria-label="3º lugar"
                      >
                        🥉
                      </span>
                    ) : (
                      <span className="inline-flex min-w-6 items-center justify-center text-sm font-extrabold text-slate-700 md:min-w-8 md:text-base">
                        {index + 1}
                      </span>
                    )}
                    <UserAvatar
                      nome={item.nome}
                      email={item.email}
                      size="sm"
                    />
                    <p className="min-w-0 truncate text-[12px] font-semibold text-black md:text-base">
                      {item.label}
                    </p>
                  </div>

                  <div className="mt-0.5 flex min-w-0 flex-col text-[10px] leading-tight text-gray-600 md:hidden">
                    <p
                      className={`truncate font-extrabold ${
                        item.repasseBruto >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      R$ {formatarNumero(item.repasseBruto)} • ROI {formatarNumero(item.roiMes)}% •{" "}
                      {item.operacoesCount} {item.operacoesCount === 1 ? "op" : "ops"}
                    </p>
                  </div>

                  <p
                    className={`mt-1 hidden whitespace-nowrap text-xs font-extrabold md:mt-0 md:justify-self-center md:text-center md:text-base ${
                      item.repasseBruto >= 0 ? "text-green-600" : "text-red-600"
                    } md:block`}
                  >
                    R$ {formatarNumero(item.repasseBruto)}
                  </p>
                  <p className="hidden whitespace-nowrap text-[11px] text-gray-500 md:block md:justify-self-end md:text-right md:text-sm">
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
