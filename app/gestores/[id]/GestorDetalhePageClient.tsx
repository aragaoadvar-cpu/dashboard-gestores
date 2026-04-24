"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type RoleUsuario = "dono" | "admin" | "gestor";

type Operacao = {
  id: number;
  nome: string;
  cotacao_dolar: number | null;
  taxa_facebook: number | null;
  taxa_network: number | null;
  taxa_imposto: number | null;
  repasse_percentual: number | null;
};

type Lancamento = {
  operacao_id: number;
  facebook: number | null;
  usd: number | null;
};

type AdminGestorTaxasRow = {
  id: string;
  admin_user_id: string;
  gestor_user_id: string;
  taxa_facebook_admin: number | null;
  taxa_network_admin: number | null;
  taxa_imposto_admin: number | null;
  cotacao_dolar_admin: number | null;
  repasse_percentual_admin: number | null;
};

type ResumoOperacao = {
  custo: number;
  receita: number;
  lucro: number;
  roi: number;
  repasse: number;
};

type Props = {
  gestorId: string;
  gestorNome: string | null;
  gestorEmail: string | null;
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

const PERCENTUAL_REPASSE_PADRAO = 20;

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCorResultado(valor: number) {
  if (valor < 0) return "text-red-600";
  return "text-green-600";
}

function calcularResumoOperacao(
  operacao: Operacao,
  lancamentosOperacao: Lancamento[],
  repassePercentualOverride: number | null = null
): ResumoOperacao {
  const cotacaoDolar = Number(operacao.cotacao_dolar ?? 5.1);
  const taxaFacebook = Number(operacao.taxa_facebook ?? 13.85);
  const taxaNetwork = Number(operacao.taxa_network ?? 6.5);
  const taxaImposto = Number(operacao.taxa_imposto ?? 7);

  let custo = 0;
  let receita = 0;
  let lucro = 0;

  for (const lancamento of lancamentosOperacao) {
    const facebook = Number(lancamento.facebook ?? 0);
    const usd = Number(lancamento.usd ?? 0);

    const receitaLinha = usd * cotacaoDolar;
    const txFacebook = facebook * (taxaFacebook / 100);
    const txNetwork = receitaLinha * (taxaNetwork / 100);
    const txImposto = receitaLinha * (taxaImposto / 100);
    const custoLinha = facebook + txFacebook + txNetwork + txImposto;
    const lucroLinha = receitaLinha - custoLinha;

    custo += custoLinha;
    receita += receitaLinha;
    lucro += lucroLinha;
  }

  const roi = custo > 0 ? (lucro / custo) * 100 : 0;
  const repassePercentualFinal =
    repassePercentualOverride === null
      ? Number(operacao.repasse_percentual ?? PERCENTUAL_REPASSE_PADRAO)
      : repassePercentualOverride;
  const repasse = lucro * (repassePercentualFinal / 100);

  return {
    custo,
    receita,
    lucro,
    roi,
    repasse,
  };
}

function numeroParaInput(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return "";
  return String(valor);
}

function formatarReferencia(valor: number, casas = 2) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function parseInputNumero(valor: string): number | null {
  const limpo = valor.trim();
  if (!limpo) return null;
  const numero = Number(limpo);
  if (!Number.isFinite(numero)) return null;
  return numero;
}

export default function GestorDetalhePageClient({
  gestorId,
  gestorNome,
  gestorEmail,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const hoje = useMemo(() => new Date(), []);

  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [periodoAberto, setPeriodoAberto] = useState(false);

  const [roleUsuario, setRoleUsuario] = useState<RoleUsuario>("gestor");
  const [nomeUsuarioAtual, setNomeUsuarioAtual] = useState("");
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);

  const [taxaFacebookAdminInput, setTaxaFacebookAdminInput] = useState("");
  const [taxaNetworkAdminInput, setTaxaNetworkAdminInput] = useState("");
  const [taxaImpostoAdminInput, setTaxaImpostoAdminInput] = useState("");
  const [cotacaoDolarAdminInput, setCotacaoDolarAdminInput] = useState("");
  const [repassePercentualAdminInput, setRepassePercentualAdminInput] = useState("");
  const [carregandoTaxas, setCarregandoTaxas] = useState(false);
  const [salvandoTaxas, setSalvandoTaxas] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processandoAcao, setProcessandoAcao] = useState<"remover" | "promover" | null>(null);

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

  const identificacaoGestor = useMemo(() => {
    const nome = gestorNome?.trim() || "";
    const email = gestorEmail?.trim() || "";

    if (nome && email) return `${nome} (${email})`;
    return nome || email || "Usuário não identificado";
  }, [gestorNome, gestorEmail]);

  const nomeAdminAtual = useMemo(() => {
    const nome = nomeUsuarioAtual.trim();
    return nome || "Admin";
  }, [nomeUsuarioAtual]);
  const nomeAdminAtualComCargo = useMemo(() => {
    if (nomeAdminAtual === "Admin") return "Admin";
    return `${nomeAdminAtual} - Admin`;
  }, [nomeAdminAtual]);

  const carregarTaxasAdmin = useCallback(async () => {
    setCarregandoTaxas(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCarregandoTaxas(false);
      return;
    }

    const { data: taxasData, error: taxasError } = await supabase
      .from("admin_gestor_taxas")
      .select(
        "id, admin_user_id, gestor_user_id, taxa_facebook_admin, taxa_network_admin, taxa_imposto_admin, cotacao_dolar_admin, repasse_percentual_admin"
      )
      .eq("admin_user_id", user.id)
      .eq("gestor_user_id", gestorId)
      .maybeSingle();

    if (taxasError) {
      setErro(`Erro ao carregar taxas administrativas: ${taxasError.message}`);
      setCarregandoTaxas(false);
      return;
    }

    const taxas = (taxasData as AdminGestorTaxasRow | null) ?? null;
    setTaxaFacebookAdminInput(numeroParaInput(taxas?.taxa_facebook_admin ?? null));
    setTaxaNetworkAdminInput(numeroParaInput(taxas?.taxa_network_admin ?? null));
    setTaxaImpostoAdminInput(numeroParaInput(taxas?.taxa_imposto_admin ?? null));
    setCotacaoDolarAdminInput(numeroParaInput(taxas?.cotacao_dolar_admin ?? null));
    setRepassePercentualAdminInput(numeroParaInput(taxas?.repasse_percentual_admin ?? null));
    setCarregandoTaxas(false);
  }, [supabase, gestorId]);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErro("Usuário não autenticado.");
      setCarregando(false);
      return;
    }

    const { data: perfilData, error: perfilError } = await supabase
      .from("profiles")
      .select("role, nome")
      .eq("id", user.id)
      .single();

    if (perfilError || !perfilData) {
      setErro(`Erro ao carregar perfil do usuário: ${perfilError?.message ?? "Perfil inválido."}`);
      setCarregando(false);
      return;
    }

    const roleAtual: RoleUsuario =
      perfilData.role === "dono"
        ? "dono"
        : perfilData.role === "admin"
        ? "admin"
        : "gestor";

    setRoleUsuario(roleAtual);
    setNomeUsuarioAtual((perfilData.nome ?? "").trim());

    const { data: operacoesData, error: operacoesError } = await supabase
      .from("operacoes")
      .select("id, nome, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual")
      .eq("user_id", gestorId)
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado)
      .order("id", { ascending: true });

    if (operacoesError) {
      setErro(`Erro ao carregar operações: ${operacoesError.message}`);
      setCarregando(false);
      return;
    }

    const operacoesLista = (operacoesData as Operacao[]) || [];
    setOperacoes(operacoesLista);

    const operacaoIds = operacoesLista.map((operacao) => operacao.id);
    if (operacaoIds.length > 0) {
      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from("lancamentos")
        .select("operacao_id, facebook, usd")
        .in("operacao_id", operacaoIds);

      if (lancamentosError) {
        setErro(`Erro ao carregar lançamentos: ${lancamentosError.message}`);
        setCarregando(false);
        return;
      }

      setLancamentos((lancamentosData as Lancamento[]) || []);
    } else {
      setLancamentos([]);
    }

    if (roleAtual === "admin") {
      await carregarTaxasAdmin();
    }

    setCarregando(false);
  }, [supabase, gestorId, mesSelecionado, anoSelecionado, carregarTaxasAdmin]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const resumoPorOperacao = useMemo(() => {
    const mapa = new Map<number, ResumoOperacao>();

    for (const operacao of operacoes) {
      const lancamentosOperacao = lancamentos.filter(
        (lancamento) => lancamento.operacao_id === operacao.id
      );
      mapa.set(operacao.id, calcularResumoOperacao(operacao, lancamentosOperacao));
    }

    return mapa;
  }, [operacoes, lancamentos]);

  const resumoGeral = useMemo(() => {
    let custoTotal = 0;
    let receitaTotal = 0;
    let lucroTotal = 0;
    let repasseBrutoTotal = 0;

    for (const operacao of operacoes) {
      const resumo = resumoPorOperacao.get(operacao.id);
      if (!resumo) continue;
      custoTotal += resumo.custo;
      receitaTotal += resumo.receita;
      lucroTotal += resumo.lucro;
      repasseBrutoTotal += resumo.repasse;
    }

    const roi = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;

    return {
      operacoesCount: operacoes.length,
      receitaTotal,
      custoTotal,
      lucroTotal,
      roi,
      repasseBrutoTotal,
    };
  }, [operacoes, resumoPorOperacao]);

  const resumoAdminSimulado = useMemo(() => {
    const overrideCotacao = parseInputNumero(cotacaoDolarAdminInput);
    const overrideFacebook = parseInputNumero(taxaFacebookAdminInput);
    const overrideNetwork = parseInputNumero(taxaNetworkAdminInput);
    const overrideImposto = parseInputNumero(taxaImpostoAdminInput);
    const overrideRepassePercentual = parseInputNumero(repassePercentualAdminInput);

    let custoTotal = 0;
    let receitaTotal = 0;
    let lucroTotal = 0;
    let repasseBrutoTotal = 0;

    for (const operacao of operacoes) {
      const operacaoComOverride: Operacao = {
        ...operacao,
        cotacao_dolar: overrideCotacao === null ? operacao.cotacao_dolar : overrideCotacao,
        taxa_facebook: overrideFacebook === null ? operacao.taxa_facebook : overrideFacebook,
        taxa_network: overrideNetwork === null ? operacao.taxa_network : overrideNetwork,
        taxa_imposto: overrideImposto === null ? operacao.taxa_imposto : overrideImposto,
      };

      const lancamentosOperacao = lancamentos.filter(
        (lancamento) => lancamento.operacao_id === operacao.id
      );
      const resumo = calcularResumoOperacao(
        operacaoComOverride,
        lancamentosOperacao,
        overrideRepassePercentual
      );
      custoTotal += resumo.custo;
      receitaTotal += resumo.receita;
      lucroTotal += resumo.lucro;
      repasseBrutoTotal += resumo.repasse;
    }

    const roi = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;

    return {
      operacoesCount: operacoes.length,
      receitaTotal,
      custoTotal,
      lucroTotal,
      roi,
      repasseBrutoTotal,
    };
  }, [
    operacoes,
    lancamentos,
    cotacaoDolarAdminInput,
    taxaFacebookAdminInput,
    taxaNetworkAdminInput,
    taxaImpostoAdminInput,
    repassePercentualAdminInput,
  ]);

  const referenciasTaxasGestor = useMemo(() => {
    function primeiroValorOuPadrao(
      getter: (operacao: Operacao) => number | null,
      padrao: number
    ) {
      for (const operacao of operacoes) {
        const valor = getter(operacao);
        if (valor !== null && Number.isFinite(Number(valor))) {
          return Number(valor);
        }
      }
      return padrao;
    }

    return {
      cotacaoDolar: primeiroValorOuPadrao((operacao) => operacao.cotacao_dolar, 5.1),
      taxaFacebook: primeiroValorOuPadrao((operacao) => operacao.taxa_facebook, 13.85),
      taxaNetwork: primeiroValorOuPadrao((operacao) => operacao.taxa_network, 6.5),
      taxaImposto: primeiroValorOuPadrao((operacao) => operacao.taxa_imposto, 7),
      repassePercentual: primeiroValorOuPadrao((operacao) => operacao.repasse_percentual, 20),
    };
  }, [operacoes]);

  async function salvarTaxasAdministrativas() {
    if (roleUsuario !== "admin") return;

    setErro("");
    setMensagem("");
    setSalvandoTaxas(true);

    try {
      const response = await fetch("/api/admin-gestor-taxas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gestor_user_id: gestorId,
          taxa_facebook_admin: taxaFacebookAdminInput,
          taxa_network_admin: taxaNetworkAdminInput,
          taxa_imposto_admin: taxaImpostoAdminInput,
          cotacao_dolar_admin: cotacaoDolarAdminInput,
          repasse_percentual_admin: repassePercentualAdminInput,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível salvar as taxas administrativas.");
        setSalvandoTaxas(false);
        return;
      }

      setMensagem(data?.message ?? "Taxas administrativas salvas com sucesso.");
      await carregarTaxasAdmin();
      router.refresh();
    } catch (error) {
      setErro(`Erro inesperado ao salvar taxas: ${(error as Error).message}`);
    } finally {
      setSalvandoTaxas(false);
    }
  }

  async function executarAcaoGestor(action: "remover_gestor" | "tornar_administrador") {
    const mensagemConfirmacao =
      action === "remover_gestor"
        ? `Tem certeza que deseja remover ${identificacaoGestor} da equipe?`
        : `Tem certeza que deseja promover ${identificacaoGestor} para administrador?`;

    const confirmou = window.confirm(mensagemConfirmacao);
    if (!confirmou) return;

    setErro("");
    setMensagem("");
    setProcessandoAcao(action === "remover_gestor" ? "remover" : "promover");

    try {
      const response = await fetch(`/api/gestores/${encodeURIComponent(gestorId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível concluir a ação.");
        setProcessandoAcao(null);
        return;
      }

      setMensagem(data?.message ?? "Ação concluída com sucesso.");
      router.push("/gestores");
      router.refresh();
    } catch (error) {
      setErro(`Erro inesperado ao executar ação: ${(error as Error).message}`);
    } finally {
      setProcessandoAcao(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-black md:text-4xl xl:text-5xl">
            Gerenciar gestor
          </h1>
          <p className="mt-2 text-sm text-gray-600 md:text-lg">{identificacaoGestor}</p>
        </header>

        <section className="mt-6 rounded-[24px] card-white-modern p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeriodoAberto((prev) => !prev)}
                className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-black md:px-5 md:text-base"
              >
                Selecionar período — {MESES.find((m) => m.valor === mesSelecionado)?.label}/
                {anoSelecionado}
              </button>

              {periodoAberto && (
                <div className="absolute left-0 top-full z-20 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-gray-200 card-white-modern p-2 shadow-xl">
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
                          ? "bg-black text-white"
                          : "text-black hover:bg-gray-100"
                      }`}
                    >
                      {periodo.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700 md:text-base">
              Período selecionado:{" "}
              <span className="font-semibold text-black">
                {nomeMesSelecionado} {anoSelecionado}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-gray-500">Nome</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {gestorNome?.trim() || "Não informado"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-gray-500">Email</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {gestorEmail?.trim() || "Não informado"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-gray-500">Período atual</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {nomeMesSelecionado} {anoSelecionado}
              </p>
            </div>
          </div>

          {!!erro && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          {!!mensagem && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {mensagem}
            </div>
          )}

          {carregando && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Atualizando dados do período...
            </div>
          )}
        </section>

        <section className="mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
            Resultado do gestor (real)
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-[20px] border-l-4 border-red-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 md:text-sm">Operações</p>
              <p className="mt-2 text-lg font-extrabold text-black md:text-2xl">
                {resumoGeral.operacoesCount}
              </p>
            </div>

            <div className="rounded-[20px] border-l-4 border-yellow-400 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 md:text-sm">Repasse bruto</p>
              <p
                className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                  resumoGeral.repasseBrutoTotal
                )}`}
              >
                R$ {formatarNumero(resumoGeral.repasseBrutoTotal)}
              </p>
            </div>

            <div className="rounded-[20px] border-l-4 border-blue-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 md:text-sm">Lucro</p>
              <p
                className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                  resumoGeral.lucroTotal
                )}`}
              >
                R$ {formatarNumero(resumoGeral.lucroTotal)}
              </p>
            </div>

            <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 md:text-sm">ROI</p>
              <p
                className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                  resumoGeral.roi
                )}`}
              >
                {formatarNumero(resumoGeral.roi)}%
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[24px] card-white-modern p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-extrabold text-black md:text-2xl">
            Taxas administrativas de {nomeAdminAtualComCargo} para este gestor
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Essas taxas afetam apenas a visão administrativa do seu painel e não alteram os dados
            reais do gestor.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Deixe vazio para usar a taxa original do gestor. Preencha{" "}
            <span className="font-semibold">0</span> para zerar na sua visão administrativa.
          </p>

          {roleUsuario === "admin" ? (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Cotacao dolar ({nomeAdminAtualComCargo})
                </p>
                <input
                  type="number"
                  step="0.0001"
                  inputMode="decimal"
                  value={cotacaoDolarAdminInput}
                  onChange={(e) => setCotacaoDolarAdminInput(e.target.value)}
                  placeholder={String(referenciasTaxasGestor.cotacaoDolar)}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Cotacao atual do gestor: {formatarReferencia(referenciasTaxasGestor.cotacaoDolar, 4)}
                </p>
              </label>

              <label className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Taxa Facebook ({nomeAdminAtualComCargo} %)
                </p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={taxaFacebookAdminInput}
                  onChange={(e) => setTaxaFacebookAdminInput(e.target.value)}
                  placeholder={String(referenciasTaxasGestor.taxaFacebook)}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Taxa atual do gestor: {formatarReferencia(referenciasTaxasGestor.taxaFacebook)}%
                </p>
              </label>

              <label className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Taxa Network ({nomeAdminAtualComCargo} %)
                </p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={taxaNetworkAdminInput}
                  onChange={(e) => setTaxaNetworkAdminInput(e.target.value)}
                  placeholder={String(referenciasTaxasGestor.taxaNetwork)}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Taxa atual do gestor: {formatarReferencia(referenciasTaxasGestor.taxaNetwork)}%
                </p>
              </label>

              <label className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Taxa Imposto ({nomeAdminAtualComCargo} %)
                </p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={taxaImpostoAdminInput}
                  onChange={(e) => setTaxaImpostoAdminInput(e.target.value)}
                  placeholder={String(referenciasTaxasGestor.taxaImposto)}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Taxa atual do gestor: {formatarReferencia(referenciasTaxasGestor.taxaImposto)}%
                </p>
              </label>

              <label className="rounded-xl bg-gray-50 p-3 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Repasse (%) de {nomeAdminAtualComCargo}
                </p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={repassePercentualAdminInput}
                  onChange={(e) => setRepassePercentualAdminInput(e.target.value)}
                  placeholder={String(referenciasTaxasGestor.repassePercentual)}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Repasse atual do gestor:{" "}
                  {formatarReferencia(referenciasTaxasGestor.repassePercentual)}%
                </p>
              </label>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
              Apenas administradores editam taxas administrativas por gestor.
            </div>
          )}

          {roleUsuario === "admin" && (
            <section className="mt-5">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
                Sua visão ({nomeAdminAtualComCargo})
              </p>
              <p className="mb-3 text-xs text-gray-500">
                Simulação em tempo real com os valores digitados, sem salvar automaticamente.
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-[20px] border-l-4 border-red-500 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 md:text-sm">Operações</p>
                  <p className="mt-2 text-lg font-extrabold text-black md:text-2xl">
                    {resumoAdminSimulado.operacoesCount}
                  </p>
                </div>

                <div className="rounded-[20px] border-l-4 border-yellow-400 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 md:text-sm">Repasse bruto</p>
                  <p
                    className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                      resumoAdminSimulado.repasseBrutoTotal
                    )}`}
                  >
                    R$ {formatarNumero(resumoAdminSimulado.repasseBrutoTotal)}
                  </p>
                </div>

                <div className="rounded-[20px] border-l-4 border-blue-500 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 md:text-sm">Lucro</p>
                  <p
                    className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                      resumoAdminSimulado.lucroTotal
                    )}`}
                  >
                    R$ {formatarNumero(resumoAdminSimulado.lucroTotal)}
                  </p>
                </div>

                <div className="rounded-[20px] border-l-4 border-green-500 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 md:text-sm">ROI</p>
                  <p
                    className={`mt-2 text-lg font-extrabold md:text-2xl ${getCorResultado(
                      resumoAdminSimulado.roi
                    )}`}
                  >
                    {formatarNumero(resumoAdminSimulado.roi)}%
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {roleUsuario === "admin" && (
              <button
                type="button"
                onClick={salvarTaxasAdministrativas}
                disabled={salvandoTaxas || carregandoTaxas}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:brightness-110 disabled:opacity-60"
              >
                {salvandoTaxas ? "Salvando..." : "Salvar taxas administrativas"}
              </button>
            )}

            <button
              type="button"
              onClick={() => executarAcaoGestor("remover_gestor")}
              disabled={processandoAcao !== null}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            >
              {processandoAcao === "remover" ? "Removendo..." : "Remover gestor"}
            </button>

            <button
              type="button"
              onClick={() => executarAcaoGestor("tornar_administrador")}
              disabled={processandoAcao !== null}
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
            >
              {processandoAcao === "promover" ? "Promovendo..." : "Tornar administrador"}
            </button>

            <Link
              href={`/operacoes?owner_id=${encodeURIComponent(gestorId)}`}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-50"
            >
              Ver operações do gestor
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
