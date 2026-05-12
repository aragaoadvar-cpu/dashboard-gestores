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
} from "@/lib/aliado-financeiro/types";
import {
  compararMesAnterior,
  compararPeriodoParcial,
  filtrarLancamentosPorMes,
  formatarMoeda,
  formatarPercentual,
  somarLancamentos,
} from "@/lib/aliado-financeiro/utils";
import { getMesAnoFromSearchParams } from "@/lib/periodo";

type Props = {
  ownerUserId: string;
  ownerNome: string;
  canEdit: boolean;
  isSharedView: boolean;
  escopo: FinanceiroEscopo;
};

export default function RelatoriosFinanceirosClient({
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
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamentoComRelacoes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

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

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      if (!isSharedView) {
        await garantirCategoriasFinanceirasPadrao(supabase, ownerUserId, escopo);
      }
      const inicioBusca = new Date(anoSelecionado, mesSelecionado - 3, 1).toISOString().slice(0, 10);
      const fimBusca = new Date(anoSelecionado, mesSelecionado, 0).toISOString().slice(0, 10);

      const [categoriasResp, lancamentosResp] = await Promise.all([
        supabase
          .from("financeiro_categorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .order("nome"),
        supabase
          .from("financeiro_lancamentos")
          .select(
            "*, categoria:financeiro_categorias(id,nome,tipo,cor), subcategoria:financeiro_subcategorias(id,nome)"
          )
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .gte("data", inicioBusca)
          .lte("data", fimBusca)
          .order("data", { ascending: false }),
      ]);

      if (categoriasResp.error) throw categoriasResp.error;
      if (lancamentosResp.error) throw lancamentosResp.error;

      setCategorias((categoriasResp.data as FinanceiroCategoria[]) ?? []);
      setLancamentos((lancamentosResp.data as FinanceiroLancamentoComRelacoes[]) ?? []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar os relatórios.");
    } finally {
      setCarregando(false);
    }
  }, [anoSelecionado, escopo, isSharedView, mesSelecionado, ownerUserId, supabase]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const relatorio = useMemo(() => {
    const lancamentosMes = filtrarLancamentosPorMes(lancamentos, mesSelecionado, anoSelecionado);
    const totalPorCategoria = categorias
      .map((categoria) => ({
        categoria,
        total: lancamentosMes
          .filter((item) => item.categoria_id === categoria.id)
          .reduce((acc, item) => acc + Number(item.valor), 0),
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);

    const mapaSubcategorias = new Map<string, number>();
    for (const lancamento of lancamentosMes) {
      if (!lancamento.subcategoria?.nome) continue;
      mapaSubcategorias.set(
        lancamento.subcategoria.nome,
        (mapaSubcategorias.get(lancamento.subcategoria.nome) ?? 0) + Number(lancamento.valor)
      );
    }

    const totalPorSubcategoria = Array.from(mapaSubcategorias.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    const maioresDespesas = lancamentosMes
      .filter((item) => item.tipo === "despesa")
      .sort((a, b) => Number(b.valor) - Number(a.valor))
      .slice(0, 5);

    return {
      totalPorCategoria,
      totalPorSubcategoria,
      maioresDespesas,
      comparativoAnterior: compararMesAnterior(lancamentos, mesSelecionado, anoSelecionado),
      comparativoParcial: compararPeriodoParcial(lancamentos, mesSelecionado, anoSelecionado, hoje),
      ganhos: somarLancamentos(lancamentosMes, "receita"),
      gastos: somarLancamentos(lancamentosMes, "despesa"),
    };
  }, [categorias, lancamentos, mesSelecionado, anoSelecionado, hoje]);

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
              <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">Relatórios</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                Uma leitura prática das categorias, subcategorias, maiores despesas e comparativos do escopo {escopo === "empresarial" ? "empresarial" : "pessoal"}.
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

        {erro && (
          <div className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <article className="rounded-[24px] border border-white/10 bg-[#0b1222]/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Ganhos</p>
            <p className="mt-3 text-xl font-extrabold text-emerald-300">{formatarMoeda(relatorio.ganhos)}</p>
          </article>
          <article className="rounded-[24px] border border-white/10 bg-[#0b1222]/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Gastos</p>
            <p className="mt-3 text-xl font-extrabold text-rose-300">{formatarMoeda(relatorio.gastos)}</p>
          </article>
          <article className="rounded-[24px] border border-white/10 bg-[#0b1222]/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Mês anterior</p>
            <p className="mt-3 text-lg font-extrabold text-white">{formatarMoeda(relatorio.comparativoAnterior.diferenca)}</p>
          </article>
          <article className="rounded-[24px] border border-white/10 bg-[#0b1222]/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Parcial</p>
            <p className="mt-3 text-lg font-extrabold text-white">{formatarPercentual(relatorio.comparativoParcial.percentual)}</p>
          </article>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5">
            <h2 className="text-xl font-extrabold text-white">Total por categoria</h2>
            <div className="mt-4 space-y-3">
              {relatorio.totalPorCategoria.map((item) => (
                <div key={item.categoria.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{item.categoria.nome}</span>
                    <span className="font-extrabold text-white">{formatarMoeda(item.total)}</span>
                  </div>
                </div>
              ))}
              {!carregando && relatorio.totalPorCategoria.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                  Sem lançamentos suficientes para montar o ranking por categoria.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5">
            <h2 className="text-xl font-extrabold text-white">Total por subcategoria</h2>
            <div className="mt-4 space-y-3">
              {relatorio.totalPorSubcategoria.map((item) => (
                <div key={item.nome} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{item.nome}</span>
                    <span className="font-extrabold text-white">{formatarMoeda(item.total)}</span>
                  </div>
                </div>
              ))}
              {!carregando && relatorio.totalPorSubcategoria.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                  Sem subcategorias movimentadas neste período.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5">
          <h2 className="text-xl font-extrabold text-white">Maiores despesas do mês</h2>
          <div className="mt-4 space-y-3">
            {relatorio.maioresDespesas.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-100">{item.descricao}</p>
                    <p className="text-sm text-slate-400">
                      {item.data.split("-").reverse().join("/")}
                      {item.categoria?.nome ? ` · ${item.categoria.nome}` : ""}
                      {item.subcategoria?.nome ? ` · ${item.subcategoria.nome}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-rose-300">{formatarMoeda(Number(item.valor))}</p>
                </div>
              </div>
            ))}
            {!carregando && relatorio.maioresDespesas.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                Ainda não há despesas suficientes para o ranking.
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
