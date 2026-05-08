"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import MonthYearPicker from "../components/MonthYearPicker";
import ResponsiveMetricValue from "../components/ResponsiveMetricValue";
import {
  calcularResumoOperacao,
  type ResumoOperacaoFinanceiro,
} from "../../lib/financeiro/calcularResumoOperacao";
import { buildHrefComPeriodo, getMesAnoFromSearchParams, getPeriodoQueryFromSearchParams } from "../../lib/periodo";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";
type RoleOwnerAuxiliar = "dono" | "admin" | "gestor" | null;

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

type LancamentoOperacao = {
  id: number;
  operacao_id: number;
  dia: number;
  facebook: number | null;
  usd: number | null;
  ecpm: number | null;
};

type RoidiarioOperacao = {
  label: string;
  roi: number | null;
};

type OperacaoComResumo = Operacao & {
  resumo: ResumoOperacaoFinanceiro;
  roisDiarios: RoidiarioOperacao[];
};

type PerfilDonoOperacao = {
  id: string;
  nome: string | null;
  email: string | null;
};

type AuxiliarOwnerContext = {
  owner_user_id: string;
  owner_role: "dono" | "admin" | "gestor";
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

const RESUMO_OPERACAO_VAZIO: ResumoOperacaoFinanceiro = {
  facebookTotal: 0,
  usdTotal: 0,
  ecpmMedio: 0,
  custoTotal: 0,
  receitaTotalReal: 0,
  lucroTotal: 0,
  roi: 0,
  repasseTotal: 0,
  repasseLiquidoTotal: 0,
};

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCorROI(valor: number) {
  if (valor < 0) return "text-red-600";
  if (valor <= 30) return "text-amber-500";
  if (valor <= 60) return "text-blue-600";
  return "text-green-600";
}

function formatarDiaMes(data: Date) {
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getJanelaRoiUltimosCincoDiasFechados(dataBase: Date) {
  return Array.from({ length: 5 }, (_, index) => {
    const data = new Date(dataBase);
    data.setHours(0, 0, 0, 0);
    data.setDate(data.getDate() - (index + 1));
    return data;
  });
}

export default function OperacoesPageClient() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hoje = useMemo(() => new Date(), []);
  const periodoInicial = useMemo(() => getMesAnoFromSearchParams(searchParams, hoje), [searchParams, hoje]);
  const [mesSelecionado, setMesSelecionado] = useState(periodoInicial.mes);
  const [anoSelecionado, setAnoSelecionado] = useState(periodoInicial.ano);

  const [operacoes, setOperacoes] = useState<OperacaoComResumo[]>([]);
  const [perfisDonoPorId, setPerfisDonoPorId] = useState<Record<string, PerfilDonoOperacao>>({});
  const [filtroDonoOperacaoId, setFiltroDonoOperacaoId] = useState<string>("todos");
  const [roleUsuario, setRoleUsuario] = useState<RoleUsuario>("gestor");
  const [ownerIdAuxiliar, setOwnerIdAuxiliar] = useState<string | null>(null);
  const [ownerRoleAuxiliar, setOwnerRoleAuxiliar] = useState<RoleOwnerAuxiliar>(null);
  const [nomeUsuarioAtual, setNomeUsuarioAtual] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [criacaoAberta, setCriacaoAberta] = useState(false);
  const [nomeNovaOperacao, setNomeNovaOperacao] = useState("");
  const [criando, setCriando] = useState(false);

  const [operacaoEditandoId, setOperacaoEditandoId] = useState<number | null>(null);
  const [nomeOperacaoEditando, setNomeOperacaoEditando] = useState("");
  const [salvandoNomeOperacao, setSalvandoNomeOperacao] = useState<number | null>(null);
  const [excluindoOperacaoId, setExcluindoOperacaoId] = useState<number | null>(null);

  const nomeMesSelecionado = useMemo(() => {
    return MESES.find((mes) => mes.valor === mesSelecionado)?.nome || "";
  }, [mesSelecionado]);

  const labelPerfilAtual = useMemo(() => {
    if (roleUsuario === "admin") {
      const nome = nomeUsuarioAtual.trim();
      return nome ? `${nome} - Admin` : "Admin";
    }
    if (roleUsuario === "dono") return "Dono";
    if (roleUsuario === "auxiliar") return "Auxiliar";
    return "Gestor";
  }, [roleUsuario, nomeUsuarioAtual]);

  const obterLabelDono = useCallback(
    (userId: string | null): string => {
      if (!userId) return "Usuário não identificado";

      const perfil = perfisDonoPorId[userId];
      if (!perfil) {
        if (roleUsuario === "auxiliar" && ownerIdAuxiliar && userId === ownerIdAuxiliar) {
          if (ownerRoleAuxiliar === "admin") return "Admin vinculado";
          if (ownerRoleAuxiliar === "gestor") return "Gestor vinculado";
          if (ownerRoleAuxiliar === "dono") return "Dono vinculado";
          return `Owner vinculado (${userId.slice(0, 8)})`;
        }
        return `Owner (${userId.slice(0, 8)})`;
      }

      const nome = perfil.nome?.trim() || "";
      const email = perfil.email?.trim() || "";

      if (nome && email) return `${nome} (${email})`;
      return nome || email || "Usuário não identificado";
    },
    [perfisDonoPorId, roleUsuario, ownerIdAuxiliar, ownerRoleAuxiliar]
  );

  const donosDisponiveis = useMemo(() => {
    const ownerIds = Array.from(new Set(operacoes.map((item) => item.user_id).filter(Boolean)));

    return ownerIds
      .map((id) => {
        const userId = id as string;
        return {
          id: userId,
          label: obterLabelDono(userId),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [operacoes, obterLabelDono]);

  const operacoesFiltradas = useMemo(() => {
    const base =
      filtroDonoOperacaoId === "todos"
        ? operacoes
        : operacoes.filter((operacao) => operacao.user_id === filtroDonoOperacaoId);

    return [...base].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    );
  }, [operacoes, filtroDonoOperacaoId]);

  const janelaRoiUltimosCincoDiasFechados = useMemo(
    () => getJanelaRoiUltimosCincoDiasFechados(new Date()),
    []
  );
  const periodoAtual = useMemo(() => getPeriodoQueryFromSearchParams(searchParams), [searchParams]);

  const ownerIdFromQuery = (searchParams.get("owner_id") || "").trim();

  useEffect(() => {
    setMesSelecionado(periodoInicial.mes);
    setAnoSelecionado(periodoInicial.ano);
  }, [periodoInicial]);

  const atualizarPeriodoNaUrl = useCallback(
    (mes: number, ano: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("mes", String(mes));
      params.set("ano", String(ano));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const carregarOperacoes = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setMensagem("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setOwnerIdAuxiliar(null);
      setOwnerRoleAuxiliar(null);
      setErro("Usuário não autenticado.");
      setCarregando(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role, nome")
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

    const roleAtual: RoleUsuario =
      profileData.role === "dono"
        ? "dono"
        : profileData.role === "admin"
        ? "admin"
        : profileData.role === "auxiliar"
        ? "auxiliar"
        : "gestor";

    setRoleUsuario(roleAtual);
    setNomeUsuarioAtual((profileData.nome ?? "").trim());

    let gestoresDoAdmin: string[] = [];
    let ownerDoAuxiliar: string | null = null;
    let ownerRoleDoAuxiliar: RoleOwnerAuxiliar = null;
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
    } else if (roleAtual === "auxiliar") {
      const { data: ownerContextData, error: ownerContextError } = await supabase.rpc(
        "get_auxiliar_owner_context",
        { check_auxiliar_id: user.id }
      );

      if (ownerContextError) {
        setErro(`Erro ao carregar vínculo do auxiliar: ${JSON.stringify(ownerContextError)}`);
        setCarregando(false);
        return;
      }

      const ownerContext =
        (Array.isArray(ownerContextData) ? ownerContextData[0] : ownerContextData) as
          | AuxiliarOwnerContext
          | null;

      if (!ownerContext?.owner_user_id || !ownerContext?.owner_role) {
        setErro("Auxiliar sem vínculo ativo com admin/gestor.");
        setCarregando(false);
        return;
      }

      ownerDoAuxiliar = ownerContext.owner_user_id;
      ownerRoleDoAuxiliar =
        ownerContext.owner_role === "dono"
          ? "dono"
          : ownerContext.owner_role === "admin"
          ? "admin"
          : ownerContext.owner_role === "gestor"
          ? "gestor"
          : null;

      if (!ownerRoleDoAuxiliar) {
        setErro("Owner do auxiliar inválido para operações.");
        setCarregando(false);
        return;
      }

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
    }

    setOwnerIdAuxiliar(ownerDoAuxiliar);
    setOwnerRoleAuxiliar(ownerRoleDoAuxiliar);

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
    const operacaoIds = operacoesLista.map((item) => item.id);

    let lancamentosLista: LancamentoOperacao[] = [];
    if (operacaoIds.length > 0) {
      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from("lancamentos")
        .select("id, operacao_id, dia, facebook, usd, ecpm")
        .in("operacao_id", operacaoIds)
        .order("dia", { ascending: true });

      if (lancamentosError) {
        setErro(`Erro ao carregar lançamentos das operações: ${JSON.stringify(lancamentosError)}`);
        setCarregando(false);
        return;
      }

      lancamentosLista = (lancamentosData as LancamentoOperacao[]) || [];
    }

    const operacoesComResumo: OperacaoComResumo[] = operacoesLista.map((operacao) => {
      const lancamentosDaOperacao = lancamentosLista.filter(
        (lancamento) => lancamento.operacao_id === operacao.id
      );

      const roisDiarios = janelaRoiUltimosCincoDiasFechados.map((data) => {
        const mesmoMesEAno =
          data.getMonth() + 1 === operacao.mes && data.getFullYear() === operacao.ano;

        if (!mesmoMesEAno) {
          return {
            label: formatarDiaMes(data),
            roi: null,
          };
        }

        const lancamentosDoDia = lancamentosDaOperacao.filter(
          (lancamento) => lancamento.dia === data.getDate()
        );

        if (lancamentosDoDia.length === 0) {
          return {
            label: formatarDiaMes(data),
            roi: null,
          };
        }

        return {
          label: formatarDiaMes(data),
          roi: calcularResumoOperacao(operacao, lancamentosDoDia).roi,
        };
      });

      return {
        ...operacao,
        resumo:
          lancamentosDaOperacao.length > 0
            ? calcularResumoOperacao(operacao, lancamentosDaOperacao)
            : RESUMO_OPERACAO_VAZIO,
        roisDiarios,
      };
    });

    setOperacoes(operacoesComResumo);

    const ownerIds = Array.from(
      new Set(operacoesComResumo.map((item) => item.user_id).filter(Boolean))
    ) as string[];

    if (ownerIds.length === 0) {
      setPerfisDonoPorId({});
      setFiltroDonoOperacaoId("todos");
      setCarregando(false);
      return;
    }

    let perfisLista:
      | Array<{ id: string; nome: string | null; email: string | null }>
      | null = null;

    const { data: perfisComEmail, error: perfisComEmailError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", ownerIds);

    if (!perfisComEmailError) {
      perfisLista = ((perfisComEmail as Array<{ id: string; nome: string | null }>) || []).map(
        (item) => ({
          id: item.id,
          nome: item.nome,
          email: null,
        })
      );
    } else {
      const { data: perfisSemEmail, error: perfisSemEmailError } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ownerIds);

      if (perfisSemEmailError) {
        setErro(`Erro ao carregar donos das operações: ${JSON.stringify(perfisSemEmailError)}`);
        setCarregando(false);
        return;
      }

      perfisLista = (perfisSemEmail as Array<{ id: string; nome: string | null }>).map(
        (item) => ({
          id: item.id,
          nome: item.nome,
          email: null,
        })
      );
    }

    const mapaPerfis: Record<string, PerfilDonoOperacao> = {};
    for (const perfil of perfisLista || []) {
      mapaPerfis[perfil.id] = perfil;
    }

    if (roleAtual === "auxiliar" && ownerDoAuxiliar && !mapaPerfis[ownerDoAuxiliar]) {
      mapaPerfis[ownerDoAuxiliar] = {
        id: ownerDoAuxiliar,
        nome:
          ownerRoleDoAuxiliar === "admin"
            ? "Admin vinculado"
            : ownerRoleDoAuxiliar === "gestor"
            ? "Gestor vinculado"
            : ownerRoleDoAuxiliar === "dono"
            ? "Dono vinculado"
            : null,
        email: null,
      };
    }

    setPerfisDonoPorId(mapaPerfis);

    setFiltroDonoOperacaoId((atual) => {
      if (roleAtual === "gestor" || roleAtual === "auxiliar") {
        return "todos";
      }
      if (ownerIdFromQuery && ownerIds.includes(ownerIdFromQuery)) {
        return ownerIdFromQuery;
      }
      return ownerIds.includes(atual) ? atual : "todos";
    });

    setCarregando(false);
  }, [
    anoSelecionado,
    janelaRoiUltimosCincoDiasFechados,
    mesSelecionado,
    ownerIdFromQuery,
    supabase,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void carregarOperacoes();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [carregarOperacoes]);

  function abrirCriacaoOperacao() {
    setCriacaoAberta(true);
    setNomeNovaOperacao("");
    setErro("");
    setMensagem("");
  }

  function cancelarCriacaoOperacao() {
    setCriacaoAberta(false);
    setNomeNovaOperacao("");
  }

  async function criarNovaOperacao() {
    const nomeLimpo = nomeNovaOperacao.trim();
    if (!nomeLimpo) {
      setErro("Digite um nome para a nova operação.");
      return;
    }

    setCriando(true);
    setErro("");
    setMensagem("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErro("Usuário não autenticado.");
      setCriando(false);
      return;
    }

    const ownerIdParaOperacao = roleUsuario === "auxiliar" ? ownerIdAuxiliar : user.id;
    if (!ownerIdParaOperacao) {
      setErro("Auxiliar sem vínculo ativo para criar operação.");
      setCriando(false);
      return;
    }

    const repassePadrao =
      roleUsuario === "admin" ||
      roleUsuario === "dono" ||
      (roleUsuario === "auxiliar" &&
        (ownerRoleAuxiliar === "admin" || ownerRoleAuxiliar === "dono"))
        ? 30
        : 20;

    const { error } = await supabase.from("operacoes").insert([
      {
        nome: nomeLimpo,
        mes: mesSelecionado,
        ano: anoSelecionado,
        user_id: ownerIdParaOperacao,
        cotacao_dolar: 5.1,
        taxa_facebook: 13.85,
        taxa_network: 6.5,
        taxa_imposto: 7,
        repasse_percentual: repassePadrao,
      },
    ]);

    if (error) {
      setErro(`Erro ao criar operação: ${JSON.stringify(error)}`);
      setCriando(false);
      return;
    }

    setMensagem("Operação criada com sucesso.");
    setCriando(false);
    cancelarCriacaoOperacao();
    carregarOperacoes();
  }

  function iniciarEdicaoOperacao(operacao: Operacao) {
    setOperacaoEditandoId(operacao.id);
    setNomeOperacaoEditando(operacao.nome);
    setErro("");
    setMensagem("");
  }

  function cancelarEdicaoOperacao() {
    setOperacaoEditandoId(null);
    setNomeOperacaoEditando("");
  }

  async function salvarNomeOperacao(id: number) {
    const nomeLimpo = nomeOperacaoEditando.trim();
    if (!nomeLimpo) {
      setErro("Digite um nome válido para a operação.");
      return;
    }

    setSalvandoNomeOperacao(id);
    setErro("");
    setMensagem("");

    const { error } = await supabase.from("operacoes").update({ nome: nomeLimpo }).eq("id", id);

    if (error) {
      setErro(`Erro ao salvar nome da operação: ${JSON.stringify(error)}`);
      setSalvandoNomeOperacao(null);
      return;
    }

    setMensagem("Nome da operação atualizado com sucesso.");
    setSalvandoNomeOperacao(null);
    cancelarEdicaoOperacao();
    carregarOperacoes();
  }

  async function excluirOperacao(operacao: Operacao) {
    if (roleUsuario === "auxiliar") {
      setErro("Auxiliar não pode excluir operações.");
      return;
    }

    const confirmar = window.confirm(
      `Tem certeza que deseja excluir ${operacao.nome}? Essa ação também apagará todos os lançamentos dessa operação.`
    );
    if (!confirmar) return;

    setErro("");
    setMensagem("");
    setExcluindoOperacaoId(operacao.id);

    const { error: erroLancamentos } = await supabase
      .from("lancamentos")
      .delete()
      .eq("operacao_id", operacao.id);

    if (erroLancamentos) {
      setErro(`Erro ao excluir lançamentos da operação: ${JSON.stringify(erroLancamentos)}`);
      setExcluindoOperacaoId(null);
      return;
    }

    const { error: erroOperacao } = await supabase
      .from("operacoes")
      .delete()
      .eq("id", operacao.id);

    if (erroOperacao) {
      setErro(`Erro ao excluir operação: ${JSON.stringify(erroOperacao)}`);
      setExcluindoOperacaoId(null);
      return;
    }

    if (operacaoEditandoId === operacao.id) {
      cancelarEdicaoOperacao();
    }

    setMensagem("Operação excluída com sucesso.");
    setExcluindoOperacaoId(null);
    carregarOperacoes();
  }

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl xl:text-5xl">
            Operações
          </h1>
          <p className="mt-2 text-sm text-slate-400 md:text-lg">
            Gerencie as operações do período selecionado
          </p>
        </header>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <MonthYearPicker
              mes={mesSelecionado}
              ano={anoSelecionado}
              onChange={(mes, ano) => {
                setMesSelecionado(mes);
                setAnoSelecionado(ano);
                atualizarPeriodoNaUrl(mes, ano);
              }}
              variant="dark"
            />

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 md:text-base">
              Período selecionado:{" "}
              <span className="font-semibold text-slate-100">
                {nomeMesSelecionado} {anoSelecionado}
              </span>
            </div>
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

          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-100 md:text-2xl">
                Lista de operações
              </h2>
              <p className="mt-1 text-sm text-slate-400 md:text-base">
                Perfil atual: <span className="font-semibold">{labelPerfilAtual}</span>
              </p>
            </div>

            <button
              onClick={abrirCriacaoOperacao}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white md:text-base"
            >
              + Nova Operação
            </button>
          </div>

          {(roleUsuario === "admin" || roleUsuario === "dono") && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Filtrar por gestor/dono da operação
              </label>
              <select
                value={filtroDonoOperacaoId}
                onChange={(e) => setFiltroDonoOperacaoId(e.target.value)}
                className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-sm text-slate-100 md:text-base"
              >
                <option value="todos">Todos</option>
                {donosDisponiveis.map((dono) => (
                  <option key={dono.id} value={dono.id}>
                    {dono.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {criacaoAberta && (
            <div className="mt-6 rounded-3xl border border-white/15 bg-[#0b1222]/80 p-5">
              <div className="max-w-3xl">
                <h3 className="text-lg font-bold text-slate-100 md:text-xl">Criar nova operação</h3>
                <p className="mt-1 text-sm text-slate-400">
                  A nova operação será criada em {nomeMesSelecionado} de {anoSelecionado}.
                </p>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Nome da operação
                  </label>
                  <input
                    type="text"
                    value={nomeNovaOperacao}
                    onChange={(e) => setNomeNovaOperacao(e.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-slate-100 md:text-base"
                    placeholder="Ex: Operação Meta Junho"
                  />
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={criarNovaOperacao}
                    disabled={criando}
                    className="rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 md:text-base"
                  >
                    {criando ? "Criando..." : "Confirmar criação"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelarCriacaoOperacao}
                    className="rounded-2xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-slate-100 md:text-base"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {carregando && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4 text-sm text-slate-300">
                Carregando operações...
              </div>
            )}

            {!carregando && operacoesFiltradas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-[#0b1222]/70 p-6 text-sm text-slate-300">
                Nenhuma operação encontrada para os filtros selecionados.
              </div>
            )}

            {!carregando &&
              operacoesFiltradas.map((operacao) => (
                <article
                  key={operacao.id}
                  className="rounded-3xl border border-slate-200 card-white-modern p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)_auto] xl:items-center xl:gap-6">
                    <div className="min-w-0 xl:max-w-sm">
                      {operacaoEditandoId === operacao.id ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Editar nome
                          </label>
                          <input
                            type="text"
                            value={nomeOperacaoEditando}
                            onChange={(e) => setNomeOperacaoEditando(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:w-96 md:text-base"
                          />
                        </div>
                      ) : (
                        <>
                          <h3 className="truncate text-lg font-bold text-slate-900 md:text-xl">
                            {operacao.nome}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            ID #{operacao.id} • Dono: {obterLabelDono(operacao.user_id)}
                          </p>
                        </>
                      )}
                    </div>

                    {operacaoEditandoId !== operacao.id && (
                      <div className="grid flex-1 grid-cols-2 gap-3 border-y border-slate-200/80 py-3 sm:grid-cols-3 sm:border-y-0 sm:px-2 sm:py-0 xl:grid-cols-6 xl:px-0">
                        <div className="text-center">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            ROI Geral
                          </p>
                          <ResponsiveMetricValue
                            value={`${formatarNumero(operacao.resumo.roi)}%`}
                            size="compact"
                            className={`mt-1 ${getCorROI(operacao.resumo.roi)}`}
                          />
                        </div>

                        {operacao.roisDiarios.map((roiDiario) => (
                          <div key={`${operacao.id}-${roiDiario.label}`} className="text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {roiDiario.label}
                            </p>
                            {roiDiario.roi === null ? (
                              <p className="mt-1 text-sm font-bold text-slate-400 md:text-base">
                                Sem dados
                              </p>
                            ) : (
                              <ResponsiveMetricValue
                                value={`${formatarNumero(roiDiario.roi)}%`}
                                size="compact"
                                className={`mt-1 ${getCorROI(roiDiario.roi)}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Link
                        href={buildHrefComPeriodo(`/operacao/${operacao.id}`, periodoAtual)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Abrir
                      </Link>

                      {operacaoEditandoId === operacao.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => salvarNomeOperacao(operacao.id)}
                            disabled={salvandoNomeOperacao === operacao.id}
                            className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {salvandoNomeOperacao === operacao.id ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelarEdicaoOperacao}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : roleUsuario !== "auxiliar" ? (
                        <button
                          type="button"
                          onClick={() => iniciarEdicaoOperacao(operacao)}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          Renomear
                        </button>
                      ) : null}

                      {roleUsuario !== "auxiliar" && (
                        <button
                          type="button"
                          onClick={() => excluirOperacao(operacao)}
                          disabled={excluindoOperacaoId === operacao.id}
                          className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                        >
                          {excluindoOperacaoId === operacao.id ? "Excluindo..." : "Excluir"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </section>
    </main>
  );
}
