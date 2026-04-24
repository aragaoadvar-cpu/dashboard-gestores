"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import UserAvatar from "../components/UserAvatar";

type RoleUsuario = "dono" | "admin" | "gestor";

type GestorPerfil = {
  id: string;
  nome: string | null;
  email: string | null;
};

type GestorResumo = {
  operacoesCount: number;
  receitaTotal: number;
  custoTotal: number;
  lucroTotal: number;
  roi: number;
  comissaoBruta: number;
  comissaoLiquidaBase: number;
  despesasDebito: number;
  comissaoLiquida: number;
};

type Operacao = {
  id: number;
  user_id: string | null;
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

type Despesa = {
  user_id: string | null;
  valor: number | null;
  percentual_desconto: number | null;
};

type AdminGestorTaxas = {
  gestor_user_id: string;
  taxa_facebook_admin: number | null;
  taxa_network_admin: number | null;
  taxa_imposto_admin: number | null;
  cotacao_dolar_admin: number | null;
  repasse_percentual_admin: number | null;
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
const PERCENTUAL_REPASSE_LIQUIDO_GESTOR = 50;
const RESUMO_VAZIO: GestorResumo = {
  operacoesCount: 0,
  receitaTotal: 0,
  custoTotal: 0,
  lucroTotal: 0,
  roi: 0,
  comissaoBruta: 0,
  comissaoLiquidaBase: 0,
  despesasDebito: 0,
  comissaoLiquida: 0,
};

function getComFallback(overrideValue: number | null | undefined, valorReal: number, valorPadrao: number) {
  if (overrideValue === null || overrideValue === undefined) {
    return Number.isFinite(valorReal) ? valorReal : valorPadrao;
  }
  const convertido = Number(overrideValue);
  return Number.isFinite(convertido) ? convertido : valorPadrao;
}

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

export default function GestoresPageClient() {
  const supabase = useMemo(() => createClient(), []);
  const hoje = useMemo(() => new Date(), []);

  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [periodoAberto, setPeriodoAberto] = useState(false);

  const [roleUsuario, setRoleUsuario] = useState<RoleUsuario>("gestor");
  const [userIdAtual, setUserIdAtual] = useState("");
  const [nomeUsuarioAtual, setNomeUsuarioAtual] = useState("");
  const [gestores, setGestores] = useState<GestorPerfil[]>([]);
  const [resumoPorGestor, setResumoPorGestor] = useState<Record<string, GestorResumo>>({});
  const [resumoAdminProprio, setResumoAdminProprio] = useState<GestorResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

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

  const nomeAdminAtual = useMemo(() => {
    const nome = nomeUsuarioAtual.trim();
    return nome || "Admin";
  }, [nomeUsuarioAtual]);
  const nomeAdminAtualComCargo = useMemo(() => {
    if (nomeAdminAtual === "Admin") return "Admin";
    return `${nomeAdminAtual} - Admin`;
  }, [nomeAdminAtual]);

  function getLabelGestor(gestor: GestorPerfil) {
    const nome = gestor.nome?.trim() || "";
    const email = gestor.email?.trim() || "";
    if (nome && email) return `${nome} (${email})`;
    return nome || email || "Gestor sem identificação";
  }

  const rankingCardsOrdenados = useMemo(() => {
    const itens: Array<
      | {
          tipo: "gestor";
          id: string;
          label: string;
          pontuacao: number;
          gestor: GestorPerfil;
          resumo: GestorResumo;
        }
      | {
          tipo: "admin";
          id: "__admin__";
          label: string;
          pontuacao: number;
          resumo: GestorResumo;
        }
    > = [];

    for (const gestor of gestores) {
      const resumo = resumoPorGestor[gestor.id] || RESUMO_VAZIO;
      itens.push({
        tipo: "gestor",
        id: gestor.id,
        label: getLabelGestor(gestor),
        pontuacao: resumo.comissaoBruta,
        gestor,
        resumo,
      });
    }

    if (roleUsuario === "admin" && resumoAdminProprio) {
      itens.push({
        tipo: "admin",
        id: "__admin__",
        label: "Minhas Operações",
        pontuacao: resumoAdminProprio.comissaoBruta,
        resumo: resumoAdminProprio,
      });
    }

    itens.sort((a, b) => {
      if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
      return a.label.localeCompare(b.label, "pt-BR");
    });

    return itens;
  }, [gestores, resumoPorGestor, roleUsuario, resumoAdminProprio]);

  const resumoContabilidadeAdmin = useMemo(() => {
    const lucroAdminGestores = gestores.reduce((acc, gestor) => {
      const resumo = resumoPorGestor[gestor.id] || RESUMO_VAZIO;
      const lucroAdminGestor = resumo.comissaoBruta - resumo.comissaoLiquida;
      return acc + lucroAdminGestor;
    }, 0);

    const lucroAdminOperacaoPropria = resumoAdminProprio
      ? resumoAdminProprio.comissaoBruta - resumoAdminProprio.despesasDebito
      : 0;

    const lucroTotalAdmin = lucroAdminGestores + lucroAdminOperacaoPropria;

    const comissaoGestoresPorGestor = gestores
      .map((gestor) => {
        const resumo = resumoPorGestor[gestor.id] || RESUMO_VAZIO;
        const nome = gestor.nome?.trim() || gestor.email?.trim() || "Gestor sem identificação";
        return {
          gestorId: gestor.id,
          nome,
          comissaoGestores: resumo.comissaoLiquida,
        };
      })
      .sort((a, b) => {
        if (b.comissaoGestores !== a.comissaoGestores) {
          return b.comissaoGestores - a.comissaoGestores;
        }
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    return {
      lucroAdminGestores,
      lucroAdminOperacaoPropria,
      lucroTotalAdmin,
      comissaoGestoresPorGestor,
    };
  }, [gestores, resumoPorGestor, resumoAdminProprio]);

  const carregarGestores = useCallback(async () => {
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
    setUserIdAtual(user.id);

    const { data: profileDataComAvatar, error: profileErrorComAvatar } = await supabase
      .from("profiles")
      .select("role, nome")
      .eq("id", user.id)
      .single();

    let profileData:
      | {
          role: string | null;
          nome: string | null;
        }
      | null = null;

    if (!profileErrorComAvatar && profileDataComAvatar) {
      profileData = profileDataComAvatar as {
        role: string | null;
        nome: string | null;
      };
    } else {
      const { data: profileDataSemAvatar, error: profileErrorSemAvatar } = await supabase
        .from("profiles")
        .select("role, nome")
        .eq("id", user.id)
        .single();

      if (profileErrorSemAvatar || !profileDataSemAvatar) {
        setErro(
          `Erro ao carregar perfil do usuário: ${
            profileErrorSemAvatar?.message ?? "Perfil não encontrado."
          }`
        );
        setCarregando(false);
        return;
      }

      profileData = {
        role: profileDataSemAvatar.role ?? null,
        nome: profileDataSemAvatar.nome ?? null,
      };
    }

    const roleAtual: RoleUsuario =
      profileData.role === "dono"
        ? "dono"
        : profileData.role === "admin"
        ? "admin"
        : "gestor";

    setRoleUsuario(roleAtual);
    setNomeUsuarioAtual((profileData.nome ?? "").trim());
    setResumoAdminProprio(null);

    if (roleAtual === "gestor") {
      setErro("Acesso não permitido para gestor.");
      setCarregando(false);
      return;
    }

    let gestorIds: string[] = [];

    const taxasAdminPorGestorId: Record<string, AdminGestorTaxas> = {};

    if (roleAtual === "admin") {
      const { data: vinculosData, error: vinculosError } = await supabase
        .from("admin_gestores")
        .select("gestor_user_id")
        .eq("admin_user_id", user.id)
        .eq("status", "ativo");

      if (vinculosError) {
        setErro(`Erro ao carregar vínculos de gestores: ${JSON.stringify(vinculosError)}`);
        setCarregando(false);
        return;
      }

      gestorIds =
        (vinculosData as Array<{ gestor_user_id: string | null }>)
          ?.map((item) => item.gestor_user_id)
          .filter((id): id is string => Boolean(id)) || [];

      if (gestorIds.length > 0) {
        const { data: taxasData, error: taxasError } = await supabase
          .from("admin_gestor_taxas")
          .select(
            "gestor_user_id, taxa_facebook_admin, taxa_network_admin, taxa_imposto_admin, cotacao_dolar_admin, repasse_percentual_admin"
          )
          .eq("admin_user_id", user.id)
          .in("gestor_user_id", gestorIds);

        if (taxasError) {
          setErro(`Erro ao carregar taxas administrativas: ${JSON.stringify(taxasError)}`);
          setCarregando(false);
          return;
        }

        for (const taxa of (taxasData as AdminGestorTaxas[]) || []) {
          taxasAdminPorGestorId[taxa.gestor_user_id] = taxa;
        }
      }
    } else {
      const { data: gestoresData, error: gestoresError } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "gestor");

      if (gestoresError) {
        setErro(`Erro ao carregar gestores: ${JSON.stringify(gestoresError)}`);
        setCarregando(false);
        return;
      }

      gestorIds = ((gestoresData as Array<{ id: string }>) || []).map((item) => item.id);
    }

    if (roleAtual === "admin") {
      const { data: operacoesPropriasData, error: operacoesPropriasError } = await supabase
        .from("operacoes")
        .select("id, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual")
        .eq("user_id", user.id)
        .eq("mes", mesSelecionado)
        .eq("ano", anoSelecionado);

      if (operacoesPropriasError) {
        setErro(
          `Erro ao carregar operações próprias do admin: ${JSON.stringify(operacoesPropriasError)}`
        );
        setCarregando(false);
        return;
      }

      const operacoesPropriasLista = (operacoesPropriasData as Operacao[]) || [];
      const operacoesPropriasIds = operacoesPropriasLista.map((operacao) => operacao.id);

      let lancamentosPropriosLista: Lancamento[] = [];
      if (operacoesPropriasIds.length > 0) {
        const { data: lancamentosPropriosData, error: lancamentosPropriosError } = await supabase
          .from("lancamentos")
          .select("operacao_id, facebook, usd")
          .in("operacao_id", operacoesPropriasIds);

        if (lancamentosPropriosError) {
          setErro(
            `Erro ao carregar lançamentos próprios do admin: ${JSON.stringify(
              lancamentosPropriosError
            )}`
          );
          setCarregando(false);
          return;
        }

        lancamentosPropriosLista = (lancamentosPropriosData as Lancamento[]) || [];
      }

      const lancamentosPropriosPorOperacao = new Map<number, Lancamento[]>();
      for (const lancamento of lancamentosPropriosLista) {
        const lista = lancamentosPropriosPorOperacao.get(lancamento.operacao_id) ?? [];
        lista.push(lancamento);
        lancamentosPropriosPorOperacao.set(lancamento.operacao_id, lista);
      }

      let custoTotalAdmin = 0;
      let receitaTotalAdmin = 0;
      let lucroTotalAdmin = 0;
      let comissaoBrutaAdmin = 0;

      for (const operacao of operacoesPropriasLista) {
        const cotacaoDolar = Number(operacao.cotacao_dolar ?? 5.1);
        const taxaFacebook = Number(operacao.taxa_facebook ?? 13.85);
        const taxaNetwork = Number(operacao.taxa_network ?? 6.5);
        const taxaImposto = Number(operacao.taxa_imposto ?? 7);
        const repassePercentual = Number(operacao.repasse_percentual ?? PERCENTUAL_REPASSE_PADRAO);
        const lancamentosOperacao = lancamentosPropriosPorOperacao.get(operacao.id) ?? [];

        for (const lancamento of lancamentosOperacao) {
          const facebook = Number(lancamento.facebook ?? 0);
          const usd = Number(lancamento.usd ?? 0);

          const receitaLinha = usd * cotacaoDolar;
          const txFacebook = facebook * (taxaFacebook / 100);
          const txNetwork = receitaLinha * (taxaNetwork / 100);
          const txImposto = receitaLinha * (taxaImposto / 100);
          const custoLinha = facebook + txFacebook + txNetwork + txImposto;
          const lucroLinha = receitaLinha - custoLinha;

          custoTotalAdmin += custoLinha;
          receitaTotalAdmin += receitaLinha;
          lucroTotalAdmin += lucroLinha;
          comissaoBrutaAdmin += lucroLinha * (repassePercentual / 100);
        }
      }

      const { data: despesasPropriasData, error: despesasPropriasError } = await supabase
        .from("despesas")
        .select("user_id, valor, percentual_desconto")
        .eq("user_id", user.id)
        .eq("mes", mesSelecionado)
        .eq("ano", anoSelecionado);

      if (despesasPropriasError) {
        setErro(
          `Erro ao carregar despesas próprias do admin: ${JSON.stringify(despesasPropriasError)}`
        );
        setCarregando(false);
        return;
      }

      const despesasDebitoAdmin = ((despesasPropriasData as Despesa[]) || []).reduce(
        (acc, despesa) => {
          const valor = Number(despesa.valor ?? 0);
          const percentual = Number(despesa.percentual_desconto ?? 0);
          return acc + valor * (percentual / 100);
        },
        0
      );

      setResumoAdminProprio({
        operacoesCount: operacoesPropriasLista.length,
        receitaTotal: receitaTotalAdmin,
        custoTotal: custoTotalAdmin,
        lucroTotal: lucroTotalAdmin,
        roi: custoTotalAdmin > 0 ? (lucroTotalAdmin / custoTotalAdmin) * 100 : 0,
        comissaoBruta: comissaoBrutaAdmin,
        comissaoLiquidaBase: comissaoBrutaAdmin,
        despesasDebito: despesasDebitoAdmin,
        comissaoLiquida: comissaoBrutaAdmin - despesasDebitoAdmin,
      });
    }

    if (gestorIds.length === 0) {
      setGestores([]);
      setResumoPorGestor({});
      setCarregando(false);
      return;
    }

    const { data: perfisData, error: perfisError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", gestorIds);

    if (perfisError) {
      const { data: perfisSemEmail, error: perfisSemEmailError } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", gestorIds);

      if (perfisSemEmailError) {
        const { data: perfisMinimos, error: perfisMinimosError } = await supabase
          .from("profiles")
          .select("id, nome")
          .in("id", gestorIds);

        if (perfisMinimosError) {
          setErro(`Erro ao carregar dados dos gestores: ${JSON.stringify(perfisMinimosError)}`);
          setCarregando(false);
          return;
        }

        const perfisFallbackMinimos = ((perfisMinimos as Array<{
          id: string;
          nome: string | null;
        }>) || []).map((item) => ({
          id: item.id,
          nome: item.nome,
          email: null,
        }));

        setGestores(
          perfisFallbackMinimos.sort((a, b) =>
            getLabelGestor(a).localeCompare(getLabelGestor(b), "pt-BR")
          )
        );
      } else {
        const perfisFallback = ((perfisSemEmail as Array<{
          id: string;
          nome: string | null;
          email: string | null;
        }>) || []).map((item) => ({
          id: item.id,
          nome: item.nome,
          email: item.email,
        }));

        setGestores(
          perfisFallback.sort((a, b) =>
            getLabelGestor(a).localeCompare(getLabelGestor(b), "pt-BR")
          )
        );
      }
    } else {
      const perfisLista = (perfisData as GestorPerfil[]) || [];
      setGestores(perfisLista.sort((a, b) => getLabelGestor(a).localeCompare(getLabelGestor(b), "pt-BR")));
    }

    const { data: operacoesData, error: operacoesError } = await supabase
      .from("operacoes")
      .select("id, user_id, cotacao_dolar, taxa_facebook, taxa_network, taxa_imposto, repasse_percentual")
      .in("user_id", gestorIds)
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado);

    if (operacoesError) {
      setErro(`Erro ao carregar resumo dos gestores: ${JSON.stringify(operacoesError)}`);
      setCarregando(false);
      return;
    }

    const mapaResumo: Record<string, GestorResumo> = {};
    for (const gestorId of gestorIds) {
      mapaResumo[gestorId] = {
        operacoesCount: 0,
        receitaTotal: 0,
        custoTotal: 0,
        lucroTotal: 0,
        roi: 0,
        comissaoBruta: 0,
        comissaoLiquidaBase: 0,
        despesasDebito: 0,
        comissaoLiquida: 0,
      };
    }

    const operacoesLista = (operacoesData as Operacao[]) || [];

    for (const operacao of operacoesLista) {
      if (!operacao.user_id) continue;
      if (!mapaResumo[operacao.user_id]) {
        mapaResumo[operacao.user_id] = {
          operacoesCount: 0,
          receitaTotal: 0,
          custoTotal: 0,
          lucroTotal: 0,
          roi: 0,
          comissaoBruta: 0,
          comissaoLiquidaBase: 0,
          despesasDebito: 0,
          comissaoLiquida: 0,
        };
      }
      mapaResumo[operacao.user_id].operacoesCount += 1;
    }

    const operacaoIds = operacoesLista.map((operacao) => operacao.id);

    let lancamentosLista: Lancamento[] = [];
    if (operacaoIds.length > 0) {
      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from("lancamentos")
        .select("operacao_id, facebook, usd")
        .in("operacao_id", operacaoIds);

      if (lancamentosError) {
        setErro(`Erro ao carregar lançamentos dos gestores: ${JSON.stringify(lancamentosError)}`);
        setCarregando(false);
        return;
      }

      lancamentosLista = (lancamentosData as Lancamento[]) || [];
    }

    const lancamentosPorOperacao = new Map<number, Lancamento[]>();
    for (const lancamento of lancamentosLista) {
      const lista = lancamentosPorOperacao.get(lancamento.operacao_id) ?? [];
      lista.push(lancamento);
      lancamentosPorOperacao.set(lancamento.operacao_id, lista);
    }

    for (const operacao of operacoesLista) {
      if (!operacao.user_id) continue;

      const cotacaoDolarReal = Number(operacao.cotacao_dolar ?? 5.1);
      const taxaFacebookReal = Number(operacao.taxa_facebook ?? 13.85);
      const taxaNetworkReal = Number(operacao.taxa_network ?? 6.5);
      const taxaImpostoReal = Number(operacao.taxa_imposto ?? 7);
      const repassePercentualReal = Number(
        operacao.repasse_percentual ?? PERCENTUAL_REPASSE_PADRAO
      );

      const override = roleAtual === "admin" ? taxasAdminPorGestorId[operacao.user_id] : null;
      const cotacaoDolarAdmin = getComFallback(
        override?.cotacao_dolar_admin,
        cotacaoDolarReal,
        5.1
      );
      const taxaFacebookAdmin = getComFallback(
        override?.taxa_facebook_admin,
        taxaFacebookReal,
        13.85
      );
      const taxaNetworkAdmin = getComFallback(
        override?.taxa_network_admin,
        taxaNetworkReal,
        6.5
      );
      const taxaImpostoAdmin = getComFallback(
        override?.taxa_imposto_admin,
        taxaImpostoReal,
        7
      );
      const repassePercentualAdmin = getComFallback(
        override?.repasse_percentual_admin,
        repassePercentualReal,
        PERCENTUAL_REPASSE_PADRAO
      );
      const lancamentosOperacao = lancamentosPorOperacao.get(operacao.id) ?? [];

      let custoOperacaoAdmin = 0;
      let receitaOperacaoAdmin = 0;
      let lucroOperacaoAdmin = 0;
      let lucroOperacaoReal = 0;

      for (const lancamento of lancamentosOperacao) {
        const facebook = Number(lancamento.facebook ?? 0);
        const usd = Number(lancamento.usd ?? 0);

        const receitaLinhaReal = usd * cotacaoDolarReal;
        const txFacebookReal = facebook * (taxaFacebookReal / 100);
        const txNetworkReal = receitaLinhaReal * (taxaNetworkReal / 100);
        const txImpostoReal = receitaLinhaReal * (taxaImpostoReal / 100);
        const custoLinhaReal = facebook + txFacebookReal + txNetworkReal + txImpostoReal;
        const lucroLinhaReal = receitaLinhaReal - custoLinhaReal;

        const receitaLinhaAdmin = usd * cotacaoDolarAdmin;
        const txFacebookAdmin = facebook * (taxaFacebookAdmin / 100);
        const txNetworkAdmin = receitaLinhaAdmin * (taxaNetworkAdmin / 100);
        const txImpostoAdmin = receitaLinhaAdmin * (taxaImpostoAdmin / 100);
        const custoLinhaAdmin = facebook + txFacebookAdmin + txNetworkAdmin + txImpostoAdmin;
        const lucroLinhaAdmin = receitaLinhaAdmin - custoLinhaAdmin;

        custoOperacaoAdmin += custoLinhaAdmin;
        receitaOperacaoAdmin += receitaLinhaAdmin;
        lucroOperacaoAdmin += lucroLinhaAdmin;
        lucroOperacaoReal += lucroLinhaReal;
      }

      mapaResumo[operacao.user_id].custoTotal += custoOperacaoAdmin;
      mapaResumo[operacao.user_id].receitaTotal += receitaOperacaoAdmin;
      mapaResumo[operacao.user_id].lucroTotal += lucroOperacaoAdmin;
      const comissaoBrutaOperacao = lucroOperacaoAdmin * (repassePercentualAdmin / 100);
      mapaResumo[operacao.user_id].comissaoBruta += comissaoBrutaOperacao;
      const comissaoBrutaReal = lucroOperacaoReal * (repassePercentualReal / 100);
      mapaResumo[operacao.user_id].comissaoLiquidaBase +=
        comissaoBrutaReal * (PERCENTUAL_REPASSE_LIQUIDO_GESTOR / 100);
    }

    const { data: despesasData, error: despesasError } = await supabase
      .from("despesas")
      .select("user_id, valor, percentual_desconto")
      .in("user_id", gestorIds)
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado);

    if (despesasError) {
      setErro(`Erro ao carregar despesas dos gestores: ${JSON.stringify(despesasError)}`);
      setCarregando(false);
      return;
    }

    const despesasLista = (despesasData as Despesa[]) || [];
    for (const despesa of despesasLista) {
      if (!despesa.user_id || !mapaResumo[despesa.user_id]) continue;
      const valor = Number(despesa.valor ?? 0);
      const percentual = Number(despesa.percentual_desconto ?? 0);
      const valorDebitado = valor * (percentual / 100);
      mapaResumo[despesa.user_id].despesasDebito += valorDebitado;
    }

    for (const gestorId of Object.keys(mapaResumo)) {
      const custoTotal = mapaResumo[gestorId].custoTotal;
      const lucroTotal = mapaResumo[gestorId].lucroTotal;
      mapaResumo[gestorId].roi = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;
      mapaResumo[gestorId].comissaoLiquida =
        mapaResumo[gestorId].comissaoLiquidaBase - mapaResumo[gestorId].despesasDebito;
    }

    setResumoPorGestor(mapaResumo);
    setCarregando(false);
  }, [supabase, mesSelecionado, anoSelecionado]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void carregarGestores();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [carregarGestores]);

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl xl:text-5xl">
            Gestores
          </h1>
          <p className="mt-2 text-sm text-slate-400 md:text-lg">
            {roleUsuario === "dono"
              ? "Visão global dos gestores do sistema"
              : `Gestores vinculados a ${nomeAdminAtualComCargo}`}
          </p>
        </header>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeriodoAberto((prev) => !prev)}
                className="rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-sm font-semibold text-slate-100 md:px-5 md:text-base"
              >
                Selecionar período — {MESES.find((m) => m.valor === mesSelecionado)?.label}/
                {anoSelecionado}
              </button>

              {periodoAberto && (
                <div className="absolute left-0 top-full z-20 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1222] p-2 shadow-xl">
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

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 md:text-base">
              Período selecionado:{" "}
              <span className="font-semibold text-slate-100">
                {nomeMesSelecionado} {anoSelecionado}
              </span>
            </div>
          </div>

          {carregando && (
            <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 px-4 py-3 text-sm text-slate-300">
              Carregando gestores...
            </div>
          )}

          {!!erro && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          {!carregando && !erro && roleUsuario === "admin" && (
            <section className="mb-6 rounded-3xl border border-slate-200 card-white-modern p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-extrabold text-slate-900">Contabilidade</h2>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Visão consolidada do admin
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 card-white-modern p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Lucro Admin Gestores
                  </p>
                  <p className={`mt-2 text-xl font-extrabold ${getCorResultado(resumoContabilidadeAdmin.lucroAdminGestores)}`}>
                    R$ {formatarNumero(resumoContabilidadeAdmin.lucroAdminGestores)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 card-white-modern p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Lucro Admin Operação Própria
                  </p>
                  <p className={`mt-2 text-xl font-extrabold ${getCorResultado(resumoContabilidadeAdmin.lucroAdminOperacaoPropria)}`}>
                    R$ {formatarNumero(resumoContabilidadeAdmin.lucroAdminOperacaoPropria)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 card-white-modern p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Lucro Total Admin
                  </p>
                  <p className={`mt-2 text-xl font-extrabold ${getCorResultado(resumoContabilidadeAdmin.lucroTotalAdmin)}`}>
                    R$ {formatarNumero(resumoContabilidadeAdmin.lucroTotalAdmin)}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Comissão gestores
                </p>

                {resumoContabilidadeAdmin.comissaoGestoresPorGestor.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-slate-200 card-white-modern px-4 py-3 text-sm text-slate-600">
                    Nenhum gestor disponível para consolidar comissão.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {resumoContabilidadeAdmin.comissaoGestoresPorGestor.map((item) => (
                      <div
                        key={item.gestorId}
                        className="flex items-center justify-between rounded-xl border border-slate-200 card-white-modern px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-slate-800">{item.nome}</p>
                        <p className={`text-sm font-extrabold ${getCorResultado(item.comissaoGestores)}`}>
                          R$ {formatarNumero(item.comissaoGestores)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {!carregando && !erro && gestores.length === 0 && roleUsuario !== "admin" && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-[#0b1222]/70 px-4 py-6 text-sm text-slate-300">
              Nenhum gestor encontrado.
            </div>
          )}

          {!carregando && !erro && (gestores.length > 0 || (roleUsuario === "admin" && !!resumoAdminProprio)) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rankingCardsOrdenados.map((item, index) => {
                if (item.tipo === "gestor") {
                  const gestor = item.gestor;
                  const resumo = item.resumo;
                  const lucroAdmin = resumo.comissaoBruta - resumo.comissaoLiquida;

                  return (
                    <article
                      key={gestor.id}
                      className="rounded-3xl border border-slate-200 card-white-modern p-5 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Gestor
                      </p>
                      <p className="mt-1 text-xs font-bold text-cyan-700">#{index + 1} no ranking</p>
                      <div className="mt-2 flex items-center gap-3">
                        <UserAvatar
                          nome={gestor.nome}
                          email={gestor.email}
                          size="sm"
                        />
                        <h3 className="text-lg font-bold text-slate-900">{getLabelGestor(gestor)}</h3>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-sm text-slate-500">Operações no período</p>
                        <p className="text-lg font-extrabold text-slate-900">{resumo.operacoesCount}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">Receita</p>
                          <p className="text-sm font-extrabold text-blue-600">
                            R$ {formatarNumero(resumo.receitaTotal)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">Custo</p>
                          <p className="text-sm font-extrabold text-red-600">
                            R$ {formatarNumero(resumo.custoTotal)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">Lucro</p>
                          <p className={`text-sm font-extrabold ${getCorResultado(resumo.lucroTotal)}`}>
                            R$ {formatarNumero(resumo.lucroTotal)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">ROI</p>
                          <p className={`text-sm font-extrabold ${getCorResultado(resumo.roi)}`}>
                            {formatarNumero(resumo.roi)}%
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">Comissão bruta</p>
                          <p
                            className={`text-sm font-extrabold ${getCorResultado(
                              resumo.comissaoBruta
                            )}`}
                          >
                            R$ {formatarNumero(resumo.comissaoBruta)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                          <p className="text-xs text-slate-500">Despesas</p>
                          <p className="text-sm font-extrabold text-red-600">
                            R$ {formatarNumero(resumo.despesasDebito)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3 col-span-2">
                          <p className="text-xs text-slate-500">Comissão gestores</p>
                          <p
                            className={`text-sm font-extrabold ${getCorResultado(
                              resumo.comissaoLiquida
                            )}`}
                          >
                            R$ {formatarNumero(resumo.comissaoLiquida)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 card-white-modern p-3 col-span-2">
                          <p className="text-xs text-slate-500">Lucro {nomeAdminAtualComCargo}</p>
                          <p className={`text-sm font-extrabold ${getCorResultado(lucroAdmin)}`}>
                            R$ {formatarNumero(lucroAdmin)}
                          </p>
                        </div>
                      </div>

                      <Link
                        href={`/gestores/${encodeURIComponent(gestor.id)}`}
                        className="mt-4 inline-flex rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:brightness-110"
                      >
                        Gerenciar gestor
                      </Link>

                      <Link
                        href={`/operacoes?owner_id=${encodeURIComponent(gestor.id)}`}
                        className="mt-2 inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Ver operações
                      </Link>
                    </article>
                  );
                }

                const resumoAdmin = item.resumo;
                const lucroAdminProprio = resumoAdmin.comissaoBruta - resumoAdmin.despesasDebito;
                return (
                  <article key="__admin__" className="rounded-3xl border border-slate-200 card-white-modern p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Minhas Operações
                    </p>
                    <p className="mt-1 text-xs font-bold text-cyan-700">#{index + 1} no ranking</p>
                    <div className="mt-2 flex items-center gap-3">
                      <UserAvatar
                        nome={nomeUsuarioAtual}
                        email={null}
                        size="sm"
                      />
                      <h3 className="text-lg font-bold text-slate-900">{nomeAdminAtualComCargo}</h3>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 card-white-modern p-3">
                      <p className="text-sm text-slate-500">Operações no período</p>
                      <p className="text-lg font-extrabold text-slate-900">
                        {resumoAdmin.operacoesCount}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">Receita</p>
                        <p className="text-sm font-extrabold text-blue-600">
                          R$ {formatarNumero(resumoAdmin.receitaTotal)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">Custo</p>
                        <p className="text-sm font-extrabold text-red-600">
                          R$ {formatarNumero(resumoAdmin.custoTotal)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">Lucro</p>
                        <p className={`text-sm font-extrabold ${getCorResultado(resumoAdmin.lucroTotal)}`}>
                          R$ {formatarNumero(resumoAdmin.lucroTotal)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">ROI</p>
                        <p className={`text-sm font-extrabold ${getCorResultado(resumoAdmin.roi)}`}>
                          {formatarNumero(resumoAdmin.roi)}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">Comissão bruta</p>
                        <p className={`text-sm font-extrabold ${getCorResultado(resumoAdmin.comissaoBruta)}`}>
                          R$ {formatarNumero(resumoAdmin.comissaoBruta)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3">
                        <p className="text-xs text-slate-500">Despesas</p>
                        <p className="text-sm font-extrabold text-red-600">
                          R$ {formatarNumero(resumoAdmin.despesasDebito)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 card-white-modern p-3 col-span-2">
                        <p className="text-xs text-slate-500">Lucro {nomeAdminAtualComCargo}</p>
                        <p className={`text-sm font-extrabold ${getCorResultado(lucroAdminProprio)}`}>
                          R$ {formatarNumero(lucroAdminProprio)}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/operacoes?owner_id=${encodeURIComponent(userIdAtual)}`}
                      className="mt-4 inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Ver operações
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
