"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MonthYearPicker from "@/app/components/MonthYearPicker";
import { createClient } from "@/lib/supabase/client";
import { garantirCategoriasFinanceirasPadrao } from "@/lib/aliado-financeiro/defaults";
import FinanceiroSharedBanner from "./FinanceiroSharedBanner";
import type {
  FinanceiroCategoria,
  FinanceiroEscopo,
  FinanceiroLancamentoComRelacoes,
  FinanceiroRecorrenciaTipo,
  FinanceiroSubcategoria,
  FinanceiroTipo,
} from "@/lib/aliado-financeiro/types";
import {
  adicionarMesesNaData,
  dividirValorEmParcelas,
  formatarMoeda,
  getBadgeRecorrencia,
  getPeriodoMes,
  obterDiaDoMes,
  parseNumeroInput,
} from "@/lib/aliado-financeiro/utils";
import { getMesAnoFromSearchParams } from "@/lib/periodo";

type Props = {
  tipo: FinanceiroTipo;
  ownerUserId: string;
  ownerNome: string;
  canEdit: boolean;
  isSharedView: boolean;
  escopo: FinanceiroEscopo;
};

type FormState = {
  descricao: string;
  valor: string;
  data: string;
  categoria_id: string;
  subcategoria_id: string;
  forma_pagamento: string;
  observacao: string;
  recorrencia_tipo: FinanceiroRecorrenciaTipo;
  recorrencia_dia: string;
  parcela_total: string;
};

const formInicial: FormState = {
  descricao: "",
  valor: "",
  data: new Date().toISOString().slice(0, 10),
  categoria_id: "",
  subcategoria_id: "",
  forma_pagamento: "",
  observacao: "",
  recorrencia_tipo: "unica",
  recorrencia_dia: "",
  parcela_total: "2",
};

function getDataSugerida(mes: number, ano: number, hoje: Date) {
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  if (mes === mesAtual && ano === anoAtual) {
    return hoje.toISOString().slice(0, 10);
  }

  return new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
}

export default function LancamentosFinanceirosClient({
  tipo,
  ownerUserId,
  ownerNome,
  canEdit,
  isSharedView,
  escopo,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hoje = useMemo(() => new Date(), []);
  const periodoInicial = useMemo(() => getMesAnoFromSearchParams(searchParams, hoje), [searchParams, hoje]);

  const [mesSelecionado, setMesSelecionado] = useState(periodoInicial.mes);
  const [anoSelecionado, setAnoSelecionado] = useState(periodoInicial.ano);
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<FinanceiroSubcategoria[]>([]);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamentoComRelacoes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [form, setForm] = useState<FormState>(formInicial);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [itemEditando, setItemEditando] = useState<FinanceiroLancamentoComRelacoes | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [categoriasAbertas, setCategoriasAbertas] = useState<string[]>([]);

  useEffect(() => {
    setMesSelecionado(periodoInicial.mes);
    setAnoSelecionado(periodoInicial.ano);
  }, [periodoInicial]);

  useEffect(() => {
    if (editandoId) return;

    setForm((prev) => ({
      ...prev,
      data: getDataSugerida(mesSelecionado, anoSelecionado, hoje),
    }));
  }, [anoSelecionado, editandoId, hoje, mesSelecionado]);

  useEffect(() => {
    if (editandoId) {
      setFormularioAberto(true);
    }
  }, [editandoId]);

  const atualizarPeriodoNaUrl = useCallback(
    (mes: number, ano: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("mes", String(mes));
      params.set("ano", String(ano));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setMensagem("");

    try {
      if (!isSharedView) {
        await garantirCategoriasFinanceirasPadrao(supabase, ownerUserId, escopo);
      }
      const { inicio, fim } = getPeriodoMes(mesSelecionado, anoSelecionado);

      const [categoriasResp, subcategoriasResp, lancamentosResp] = await Promise.all([
        supabase
          .from("financeiro_categorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .eq("tipo", tipo)
          .order("nome", { ascending: true }),
        supabase
          .from("financeiro_subcategorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .order("nome", { ascending: true }),
        supabase
          .from("financeiro_lancamentos")
          .select(
            "*, categoria:financeiro_categorias(id,nome,tipo,cor), subcategoria:financeiro_subcategorias(id,nome)"
          )
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .eq("tipo", tipo)
          .gte("data", inicio.toISOString().slice(0, 10))
          .lte("data", fim.toISOString().slice(0, 10))
          .order("data", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (categoriasResp.error) throw categoriasResp.error;
      if (subcategoriasResp.error) throw subcategoriasResp.error;
      if (lancamentosResp.error) throw lancamentosResp.error;

      setCategorias((categoriasResp.data as FinanceiroCategoria[]) ?? []);
      setSubcategorias((subcategoriasResp.data as FinanceiroSubcategoria[]) ?? []);
      setLancamentos((lancamentosResp.data as FinanceiroLancamentoComRelacoes[]) ?? []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar os lançamentos.");
    } finally {
      setCarregando(false);
    }
  }, [anoSelecionado, escopo, isSharedView, mesSelecionado, ownerUserId, supabase, tipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const subcategoriasDaCategoria = useMemo(() => {
    if (!form.categoria_id) return [];
    return subcategorias.filter((item) => item.categoria_id === form.categoria_id);
  }, [form.categoria_id, subcategorias]);

  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [categorias]
  );

  const totalMes = useMemo(
    () => lancamentos.reduce((acc, item) => acc + Number(item.valor ?? 0), 0),
    [lancamentos]
  );

  const visaoDespesas = useMemo(() => {
    if (tipo !== "despesa") return null;

    const itensFiltrados = lancamentos;

    const mapaCategorias = new Map<
      string,
      {
        id: string;
        nome: string;
        total: number;
        itens: FinanceiroLancamentoComRelacoes[];
      }
    >();

    for (const item of itensFiltrados) {
      if (!item.categoria_id || !item.categoria?.nome) {
        continue;
      }

      const categoriaId = item.categoria_id;
      const categoriaNome = item.categoria.nome;
      const existente = mapaCategorias.get(categoriaId);

      if (existente) {
        existente.total += Number(item.valor ?? 0);
        existente.itens.push(item);
      } else {
        mapaCategorias.set(categoriaId, {
          id: categoriaId,
          nome: categoriaNome,
          total: Number(item.valor ?? 0),
          itens: [item],
        });
      }
    }

    const categoriasAgrupadas = Array.from(mapaCategorias.values())
      .filter((categoria) => categoria.total > 0)
      .map((categoria) => {
        return {
          ...categoria,
          itens: [...categoria.itens].sort((a, b) => {
            const dataCompare = b.data.localeCompare(a.data);
            if (dataCompare !== 0) return dataCompare;
            return a.descricao.localeCompare(b.descricao, "pt-BR");
          }),
        };
      })
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    const totalFiltrado = itensFiltrados.reduce((acc, item) => acc + Number(item.valor ?? 0), 0);
    const quantidadeLancamentos = itensFiltrados.length;
    const quantidadeCategorias = categoriasAgrupadas.length;

    return {
      categoriasAgrupadas,
      totalFiltrado,
      quantidadeLancamentos,
      quantidadeCategorias,
    };
  }, [lancamentos, tipo]);

  function atualizarForm<K extends keyof FormState>(chave: K, valor: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [chave]: valor,
      ...(chave === "categoria_id" ? { subcategoria_id: "" } : {}),
      ...(chave === "recorrencia_tipo"
        ? valor === "recorrente"
          ? { parcela_total: "2" }
          : valor === "parcelada"
            ? { recorrencia_dia: "" }
            : { recorrencia_dia: "", parcela_total: "2" }
        : {}),
    }));
  }

  function resetarForm() {
    setForm({
      ...formInicial,
      data: getDataSugerida(mesSelecionado, anoSelecionado, hoje),
    });
    setEditandoId(null);
    setItemEditando(null);
  }

  function alternarCategoriaAberta(categoriaId: string) {
    setCategoriasAbertas((atual) =>
      atual.includes(categoriaId)
        ? atual.filter((item) => item !== categoriaId)
        : [...atual, categoriaId]
    );
  }

  async function salvarLancamento() {
    if (salvando) return;
    if (!canEdit) return;

    setErro("");
    setMensagem("");

    if (!form.descricao.trim() || !form.valor || !form.data) {
      setErro("Preencha descrição, valor e data.");
      return;
    }

    if (tipo === "despesa" && !editandoId) {
      if (form.recorrencia_tipo === "recorrente" && !form.recorrencia_dia) {
        setErro("Informe o dia da recorrência mensal.");
        return;
      }

      if (form.recorrencia_tipo === "parcelada") {
        const totalParcelas = Number(form.parcela_total);
        if (!Number.isInteger(totalParcelas) || totalParcelas < 2) {
          setErro("Informe uma quantidade válida de parcelas.");
          return;
        }
      }
    }

    setSalvando(true);

    const valorNumerico = parseNumeroInput(form.valor);

    const payload = {
      user_id: ownerUserId,
      tipo,
      descricao: form.descricao.trim(),
      valor: valorNumerico,
      data: form.data,
      escopo,
      categoria_id: form.categoria_id || null,
      subcategoria_id: tipo === "despesa" ? form.subcategoria_id || null : null,
      forma_pagamento: tipo === "despesa" ? form.forma_pagamento.trim() || null : null,
      observacao: form.observacao.trim() || null,
      origem: "manual" as const,
      recorrencia_tipo:
        tipo === "despesa" ? form.recorrencia_tipo : ("unica" as const),
      recorrencia_grupo_id:
        editandoId || tipo !== "despesa" || form.recorrencia_tipo === "unica"
          ? itemEditando?.recorrencia_grupo_id ?? null
          : crypto.randomUUID(),
      parcela_atual:
        editandoId || tipo !== "despesa" || form.recorrencia_tipo !== "parcelada"
          ? itemEditando?.parcela_atual ?? null
          : null,
      parcela_total:
        editandoId || tipo !== "despesa" || form.recorrencia_tipo !== "parcelada"
          ? itemEditando?.parcela_total ?? null
          : null,
      recorrencia_ativa:
        editandoId || tipo !== "despesa"
          ? itemEditando?.recorrencia_ativa ?? false
          : form.recorrencia_tipo === "recorrente",
      recorrencia_dia:
        editandoId || tipo !== "despesa" || form.recorrencia_tipo !== "recorrente"
          ? itemEditando?.recorrencia_dia ?? null
          : Number(form.recorrencia_dia),
    };

    const operacao = editandoId
      ? supabase
          .from("financeiro_lancamentos")
          .update(payload)
          .eq("id", editandoId)
          .eq("user_id", ownerUserId)
      : (() => {
          if (tipo !== "despesa" || form.recorrencia_tipo === "unica") {
            return supabase.from("financeiro_lancamentos").insert({
              ...payload,
              recorrencia_tipo: "unica",
              recorrencia_grupo_id: null,
              parcela_atual: null,
              parcela_total: null,
              recorrencia_ativa: false,
              recorrencia_dia: null,
            });
          }

          if (form.recorrencia_tipo === "recorrente") {
            const grupoId = payload.recorrencia_grupo_id ?? crypto.randomUUID();
            const diaRecorrencia = Number(form.recorrencia_dia);
            const lancamentosRecorrentes = Array.from({ length: 12 }, (_, index) => ({
              ...payload,
              data: adicionarMesesNaData(form.data, index),
              recorrencia_tipo: "recorrente" as const,
              recorrencia_grupo_id: grupoId,
              parcela_atual: null,
              parcela_total: null,
              recorrencia_ativa: true,
              recorrencia_dia: diaRecorrencia || obterDiaDoMes(form.data),
            }));
            return supabase.from("financeiro_lancamentos").insert(lancamentosRecorrentes);
          }

          const totalParcelas = Number(form.parcela_total);
          const valoresParcelas = dividirValorEmParcelas(valorNumerico, totalParcelas);
          const grupoId = payload.recorrencia_grupo_id ?? crypto.randomUUID();
          const lancamentosParcelados = valoresParcelas.map((valorParcela, index) => ({
            ...payload,
            descricao: `${form.descricao.trim()} (${index + 1}/${totalParcelas})`,
            valor: valorParcela,
            data: adicionarMesesNaData(form.data, index),
            recorrencia_tipo: "parcelada" as const,
            recorrencia_grupo_id: grupoId,
            parcela_atual: index + 1,
            parcela_total: totalParcelas,
            recorrencia_ativa: false,
            recorrencia_dia: null,
          }));
          return supabase.from("financeiro_lancamentos").insert(lancamentosParcelados);
        })();

    const { error } = await operacao;

    setSalvando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem(
      editandoId
        ? "Lançamento atualizado com sucesso."
        : tipo === "despesa" && form.recorrencia_tipo === "recorrente"
          ? "Recorrência mensal criada com sucesso."
          : tipo === "despesa" && form.recorrencia_tipo === "parcelada"
            ? "Parcelamento criado com sucesso."
            : "Lançamento salvo com sucesso."
    );
    resetarForm();
    setFormularioAberto(false);
    void carregar();
  }

  function iniciarEdicao(item: FinanceiroLancamentoComRelacoes) {
    setEditandoId(item.id);
    setItemEditando(item);
    setForm({
      descricao: item.descricao,
      valor: String(item.valor).replace(".", ","),
      data: item.data,
      categoria_id: item.categoria_id ?? "",
      subcategoria_id: item.subcategoria_id ?? "",
      forma_pagamento: item.forma_pagamento ?? "",
      observacao: item.observacao ?? "",
      recorrencia_tipo: item.recorrencia_tipo ?? "unica",
      recorrencia_dia: item.recorrencia_dia ? String(item.recorrencia_dia) : "",
      parcela_total: item.parcela_total ? String(item.parcela_total) : "2",
    });
    setFormularioAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluirLancamento(id: string) {
    if (!canEdit) return;

    const item = lancamentos.find((entry) => entry.id === id);
    const mensagemConfirmacao =
      item && item.recorrencia_tipo !== "unica"
        ? "Deseja excluir este lançamento? Esta ação remove apenas este item da série."
        : "Deseja excluir este lançamento?";
    const ok = window.confirm(mensagemConfirmacao);
    if (!ok) return;

    const { error } = await supabase
      .from("financeiro_lancamentos")
      .delete()
      .eq("id", id)
      .eq("user_id", ownerUserId);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Lançamento excluído com sucesso.");
    if (editandoId === id) resetarForm();
    void carregar();
  }

  const titulo = tipo === "despesa" ? "Despesas" : "Ganhos";
  const descricao =
    tipo === "despesa"
      ? `Cadastre, acompanhe e revise todos os gastos ${escopo === "empresarial" ? "empresariais" : "pessoais"} do período.`
      : `Registre receitas e acompanhe a entrada de dinheiro no ${escopo === "empresarial" ? "financeiro empresarial" : "mês"}.`;
  const corTitulo = tipo === "despesa" ? "text-rose-300" : "text-emerald-300";
  const labelBotao = editandoId ? "Atualizar lançamento" : tipo === "despesa" ? "Salvar despesa" : "Salvar ganho";
  const isDespesa = tipo === "despesa";
  const mostrarAvisoEdicaoSerie =
    Boolean(editandoId) &&
    isDespesa &&
    itemEditando &&
    itemEditando.recorrencia_tipo !== "unica";
  const tituloFormulario = editandoId
    ? "Editar despesa"
    : `Add ${tipo === "despesa" ? "Despesa" : "Ganho"}`;
  const resumoGavetaDespesas = isDespesa
    ? {
        categorias: visaoDespesas?.quantidadeCategorias ?? 0,
        lancamentos: visaoDespesas?.quantidadeLancamentos ?? 0,
      }
    : null;

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl">
        <FinanceiroSharedBanner
          isSharedView={isSharedView}
          ownerNome={ownerNome}
          canEdit={canEdit}
        />

        <header className="rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                Aliado Financeiro
              </p>
              <h1 className={`mt-2 text-2xl font-extrabold md:text-4xl ${corTitulo}`}>{titulo}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                {descricao}
              </p>
            </div>

            <MonthYearPicker
              mes={mesSelecionado}
              ano={anoSelecionado}
              onChange={(mes, ano) => {
                setMesSelecionado(mes);
                setAnoSelecionado(ano);
                atualizarPeriodoNaUrl(mes, ano);
              }}
              variant="dark"
              align="right"
              compactMobile
            />
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <article
            className={`rounded-[28px] border border-white/10 bg-[#0a1020]/90 shadow-[0_18px_40px_rgba(2,6,23,0.45)] ${
              isDespesa ? "p-4 md:p-5 xl:col-span-2" : "p-5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => canEdit && setFormularioAberto((atual) => !atual)}
                disabled={!canEdit}
                className={`flex min-w-0 flex-1 items-center justify-between gap-4 rounded-[22px] border px-4 py-3 text-left transition ${
                  canEdit
                    ? "border-emerald-300/25 bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {canEdit ? "Gestão rápida" : "Visualização"}
                  </p>
                  <h2 className="mt-1 truncate text-base font-extrabold text-white">
                    {canEdit
                      ? isDespesa
                        ? "ADD DESPESAS"
                        : tituloFormulario.toUpperCase()
                      : "ADD DESPESAS"}
                  </h2>
                  {isDespesa && resumoGavetaDespesas ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Categorias: {resumoGavetaDespesas.categorias} • Lançamentos:{" "}
                      {resumoGavetaDespesas.lancamentos}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      {canEdit
                        ? formularioAberto
                          ? "Clique para recolher"
                          : "Clique para expandir"
                        : "Modo leitura"}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-lg font-bold text-emerald-200">
                  {canEdit ? (formularioAberto ? "−" : "+") : "•"}
                </span>
              </button>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                {formatarMoeda(totalMes)} no mês
              </div>
            </div>

            {canEdit ? (
              formularioAberto ? (
              <>
                <div
                  className={`mt-4 grid grid-cols-1 gap-2 ${
                    isDespesa ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2"
                  }`}
                >
                  <input
                    value={form.descricao}
                    onChange={(e) => atualizarForm("descricao", e.target.value)}
                    className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    placeholder="Descrição"
                  />
                  <input
                    value={form.valor}
                    onChange={(e) => atualizarForm("valor", e.target.value)}
                    className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    placeholder="Valor"
                  />
                  <input
                    type="date"
                    value={form.data}
                    onChange={(e) => atualizarForm("data", e.target.value)}
                    className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100"
                  />
                  <select
                    value={form.categoria_id}
                    onChange={(e) => atualizarForm("categoria_id", e.target.value)}
                    className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Categoria</option>
                    {categoriasOrdenadas.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </option>
                    ))}
                  </select>

                  {isDespesa && (
                    <>
                      {!editandoId && (
                        <select
                          value={form.recorrencia_tipo}
                          onChange={(e) =>
                            atualizarForm("recorrencia_tipo", e.target.value as FinanceiroRecorrenciaTipo)
                          }
                          className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="unica">Tipo da despesa: Única</option>
                          <option value="recorrente">Tipo da despesa: Recorrente mensal</option>
                          <option value="parcelada">Tipo da despesa: Parcelada</option>
                        </select>
                      )}

                      <select
                        value={form.subcategoria_id}
                        onChange={(e) => atualizarForm("subcategoria_id", e.target.value)}
                        className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="">Subcategoria</option>
                        {subcategoriasDaCategoria.map((subcategoria) => (
                          <option key={subcategoria.id} value={subcategoria.id}>
                            {subcategoria.nome}
                          </option>
                        ))}
                      </select>
                      <input
                        value={form.forma_pagamento}
                        onChange={(e) => atualizarForm("forma_pagamento", e.target.value)}
                        className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="Forma de pagamento"
                      />

                      {!editandoId && form.recorrencia_tipo === "recorrente" && (
                        <>
                          <input
                            value={form.recorrencia_dia}
                            onChange={(e) => atualizarForm("recorrencia_dia", e.target.value.replace(/\D/g, ""))}
                            className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="Dia da recorrência (1 a 31)"
                            inputMode="numeric"
                          />
                          <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                            A primeira versão cria 12 lançamentos mensais a partir da data inicial.
                          </div>
                        </>
                      )}

                      {!editandoId && form.recorrencia_tipo === "parcelada" && (
                        <>
                          <input
                            value={form.parcela_total}
                            onChange={(e) => atualizarForm("parcela_total", e.target.value.replace(/\D/g, ""))}
                            className="rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="Quantidade de parcelas"
                            inputMode="numeric"
                          />
                          <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            O valor informado será tratado como valor total da compra e dividido pelas parcelas.
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                <textarea
                  value={form.observacao}
                  onChange={(e) => atualizarForm("observacao", e.target.value)}
                  className="mt-2 min-h-14 w-full rounded-xl border border-white/15 bg-[#0b1222] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="Observação"
                />

                {mostrarAvisoEdicaoSerie && (
                  <div className="mt-3 rounded-xl border border-sky-300/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                    Esta edição altera apenas este lançamento.
                  </div>
                )}

                {erro && (
                  <div className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {erro}
                  </div>
                )}
                {mensagem && (
                  <div className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {mensagem}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => void salvarLancamento()}
                    disabled={salvando}
                    className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {salvando ? "Salvando..." : labelBotao}
                  </button>
                  {editandoId && (
                    <button
                      type="button"
                      onClick={resetarForm}
                      className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </>
              ) : null
            ) : (
              <div className="mt-4 rounded-[18px] border border-dashed border-white/15 bg-[#0b1222]/60 p-4 text-sm text-slate-300">
                Este compartilhamento está em modo leitura. A criação e edição de lançamentos ficam
                bloqueadas aqui.
              </div>
            )}
          </article>

          {isDespesa ? (
            <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)] xl:col-span-2">
              <div className="space-y-4">
                {!carregando && (visaoDespesas?.categoriasAgrupadas.length ?? 0) === 0 && (
                  <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                    Nenhuma despesa encontrada para este período/filtro.
                  </div>
                )}

                {visaoDespesas?.categoriasAgrupadas.map((categoria) => {
                  const categoriaAberta = categoriasAbertas.includes(categoria.id);

                  return (
                  <article
                    key={categoria.id}
                    className="overflow-hidden rounded-[22px] border border-white/10 bg-[#0b1222]/70"
                  >
                    <button
                      type="button"
                      onClick={() => alternarCategoriaAberta(categoria.id)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-white">{categoria.nome}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {formatarMoeda(categoria.total)} • {categoria.itens.length} lançamento(s)
                        </p>
                      </div>
                      <span className="shrink-0 text-lg font-bold text-slate-300">
                        {categoriaAberta ? "▴" : "▾"}
                      </span>
                    </button>

                    {categoriaAberta ? (
                      <div className="border-t border-white/10 px-3 py-3">
                        <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_110px_120px_110px_auto] gap-3 rounded-xl border border-white/10 bg-[#09101d]/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 lg:grid">
                          <span>Descrição</span>
                          <span>Subcategoria</span>
                          <span>Data</span>
                          <span>Valor</span>
                          <span>Tipo</span>
                          <span>Ações</span>
                        </div>

                        <div className="mt-2 space-y-2">
                          {categoria.itens.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-white/10 bg-[#09101d]/90 px-3 py-3"
                            >
                              <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_110px_120px_110px_auto] items-center gap-3 lg:grid">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {item.descricao}
                                  </p>
                                </div>
                                <p className="truncate text-sm text-slate-300">
                                  {item.subcategoria?.nome ?? "—"}
                                </p>
                                <p className="text-sm text-slate-300">
                                  {item.data.split("-").reverse().join("/")}
                                </p>
                                <p className="text-sm font-bold text-rose-300">
                                  {formatarMoeda(Number(item.valor))}
                                </p>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                                  {getBadgeRecorrencia(
                                    item.recorrencia_tipo ?? "unica",
                                    item.parcela_atual ?? null,
                                    item.parcela_total ?? null
                                  )}
                                </p>
                                <div className="flex items-center gap-2">
                                  {canEdit ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => iniciarEdicao(item)}
                                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void excluirLancamento(item.id)}
                                        className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                                      >
                                        Excluir
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-500">—</span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2 lg:hidden">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="min-w-0 text-sm font-semibold text-white">
                                    {item.descricao}
                                  </p>
                                  <p className="shrink-0 text-sm font-bold text-rose-300">
                                    {formatarMoeda(Number(item.valor))}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                                  <span>{item.subcategoria?.nome ?? "—"}</span>
                                  <span>{item.data.split("-").reverse().join("/")}</span>
                                  <span>
                                    {getBadgeRecorrencia(
                                      item.recorrencia_tipo ?? "unica",
                                      item.parcela_atual ?? null,
                                      item.parcela_total ?? null
                                    )}
                                  </span>
                                </div>
                                {canEdit ? (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => iniciarEdicao(item)}
                                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void excluirLancamento(item.id)}
                                      className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                                    >
                                      Excluir
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                )})}
              </div>
            </article>
          ) : (
          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Lançamentos
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-white">
                  {carregando ? "Carregando..." : `${lancamentos.length} item(ns) no período`}
                </h2>
              </div>
              <div className="text-sm text-slate-400">
                {carregando ? "Atualizando..." : formatarMoeda(totalMes)}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {!carregando && lancamentos.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                  Nenhum lançamento encontrado para este período.
                </div>
              )}

              {lancamentos.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">{item.descricao}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {item.data.split("-").reverse().join("/")}
                        {item.categoria?.nome ? ` · ${item.categoria.nome}` : ""}
                        {item.subcategoria?.nome ? ` · ${item.subcategoria.nome}` : ""}
                      </p>
                      {isDespesa && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                            {getBadgeRecorrencia(
                              item.recorrencia_tipo ?? "unica",
                              item.parcela_atual ?? null,
                              item.parcela_total ?? null
                            )}
                          </span>
                          {item.recorrencia_tipo === "recorrente" && item.recorrencia_dia && (
                            <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                              todo dia {item.recorrencia_dia}
                            </span>
                          )}
                        </div>
                      )}
                      {item.forma_pagamento && (
                        <p className="mt-1 text-sm text-slate-400">
                          Pagamento: {item.forma_pagamento}
                        </p>
                      )}
                      {item.observacao && (
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.observacao}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-3 md:items-end">
                      <p className={`text-lg font-extrabold ${isDespesa ? "text-rose-300" : "text-emerald-300"}`}>
                        {formatarMoeda(Number(item.valor))}
                      </p>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(item)}
                            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void excluirLancamento(item.id)}
                            className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </article>
          )}
        </section>
      </section>
    </main>
  );
}
