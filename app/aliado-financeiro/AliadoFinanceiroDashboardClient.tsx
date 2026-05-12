"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MonthYearPicker from "@/app/components/MonthYearPicker";
import FinanceiroSharedBanner from "./FinanceiroSharedBanner";
import { getMesAnoFromSearchParams, getNomeMes } from "@/lib/periodo";
import { garantirCategoriasFinanceirasPadrao } from "@/lib/aliado-financeiro/defaults";
import type {
  FinanceiroCategoria,
  FinanceiroEscopo,
  FinanceiroLancamentoComRelacoes,
  FinanceiroMetaCategoria,
} from "@/lib/aliado-financeiro/types";
import {
  calcularPercentualGasto,
  compararMesAnterior,
  compararPeriodoParcial,
  consolidarCategoriasMes,
  filtrarLancamentosPorMes,
  formatarMoeda,
  formatarPercentual,
  gerarAlertasFinanceiros,
  getStatusTermometro,
  somarLancamentos,
} from "@/lib/aliado-financeiro/utils";

type Props = {
  nomeUsuario: string;
  ownerUserId: string;
  ownerNome: string;
  canEdit: boolean;
  isSharedView: boolean;
  escopo: FinanceiroEscopo;
};

type EstadoCarga = {
  categorias: FinanceiroCategoria[];
  metas: FinanceiroMetaCategoria[];
  lancamentos: FinanceiroLancamentoComRelacoes[];
};

const estadoInicial: EstadoCarga = {
  categorias: [],
  metas: [],
  lancamentos: [],
};

export default function AliadoFinanceiroDashboardClient({
  nomeUsuario,
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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<EstadoCarga>(estadoInicial);

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

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      if (!isSharedView) {
        await garantirCategoriasFinanceirasPadrao(supabase, ownerUserId, escopo);
      }

      const inicioBusca = new Date(anoSelecionado, mesSelecionado - 3, 1).toISOString().slice(0, 10);
      const fimBusca = new Date(anoSelecionado, mesSelecionado, 0).toISOString().slice(0, 10);

      const [categoriasResp, metasResp, lancamentosResp] = await Promise.all([
        supabase
          .from("financeiro_categorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .order("tipo", { ascending: true })
          .order("nome", { ascending: true }),
        supabase
          .from("financeiro_metas_categoria")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .eq("mes", mesSelecionado)
          .eq("ano", anoSelecionado),
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
      if (metasResp.error) throw metasResp.error;
      if (lancamentosResp.error) throw lancamentosResp.error;

      setDados({
        categorias: (categoriasResp.data as FinanceiroCategoria[]) ?? [],
        metas: (metasResp.data as FinanceiroMetaCategoria[]) ?? [],
        lancamentos: (lancamentosResp.data as FinanceiroLancamentoComRelacoes[]) ?? [],
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o módulo.");
    } finally {
      setCarregando(false);
    }
  }, [anoSelecionado, escopo, isSharedView, mesSelecionado, ownerUserId, supabase]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const resumo = useMemo(() => {
    const lancamentosMes = filtrarLancamentosPorMes(dados.lancamentos, mesSelecionado, anoSelecionado);
    const ganhosMes = somarLancamentos(lancamentosMes, "receita");
    const gastosMes = somarLancamentos(lancamentosMes, "despesa");
    const saldoMes = ganhosMes - gastosMes;
    const percentualGasto = calcularPercentualGasto(gastosMes, ganhosMes);
    const comparativoAnterior = compararMesAnterior(dados.lancamentos, mesSelecionado, anoSelecionado);
    const comparativoParcial = compararPeriodoParcial(dados.lancamentos, mesSelecionado, anoSelecionado, hoje);
    const categoriasConsolidadas = consolidarCategoriasMes(
      dados.lancamentos,
      dados.categorias,
      dados.metas,
      mesSelecionado,
      anoSelecionado,
      hoje
    );
    const alertas = gerarAlertasFinanceiros({
      ganhosMes,
      gastosMes,
      saldoMes,
      percentualGasto,
      comparativoParcial,
      categorias: categoriasConsolidadas.map((item) => ({
        categoria: item.categoria,
        percentual: gastosMes > 0 ? (item.totalAtual / gastosMes) * 100 : 0,
        totalAtual: item.totalAtual,
        status: item.status,
      })),
    });

    return {
      ganhosMes,
      gastosMes,
      saldoMes,
      percentualGasto,
      comparativoAnterior,
      comparativoParcial,
      categoriasConsolidadas,
      alertas,
    };
  }, [dados, hoje, mesSelecionado, anoSelecionado]);

  const statusTermometro = getStatusTermometro(resumo.percentualGasto);

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
              <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">
                Visão geral do seu dinheiro
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                {nomeUsuario}, este painel acompanha ganhos, gastos, saldo e os pontos de atenção
                do seu mês no escopo {escopo === "empresarial" ? "empresarial" : "pessoal"} para te ajudar a decidir com clareza.
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
          {[
            { label: "Ganhos do mês", valor: formatarMoeda(resumo.ganhosMes), cor: "text-emerald-300" },
            { label: "Gastos do mês", valor: formatarMoeda(resumo.gastosMes), cor: "text-rose-300" },
            { label: "Saldo do mês", valor: formatarMoeda(resumo.saldoMes), cor: resumo.saldoMes >= 0 ? "text-cyan-300" : "text-amber-300" },
            { label: "Percentual gasto", valor: formatarPercentual(resumo.percentualGasto), cor: "text-white" },
          ].map((card) => (
            <article
              key={card.label}
              className="rounded-[24px] border border-white/10 bg-[#0b1222]/85 p-4 shadow-[0_16px_35px_rgba(2,6,23,0.35)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {card.label}
              </p>
              <p className={`mt-3 text-xl font-extrabold md:text-3xl ${card.cor}`}>{card.valor}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                  Termômetro geral
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-white md:text-2xl">
                  {getNomeMes(mesSelecionado)} de {anoSelecionado}
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                {statusTermometro.label}
              </span>
            </div>

            <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${statusTermometro.cor}`}
                style={{ width: `${Math.min(resumo.percentualGasto, 100)}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-300">
              Seus gastos representam <strong className="text-white">{formatarPercentual(resumo.percentualGasto)}</strong> dos ganhos do mês.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Mês anterior
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Comparando {String(resumo.comparativoAnterior.mesComparado.mes).padStart(2, "0")}/{resumo.comparativoAnterior.mesComparado.ano} contra {String(resumo.comparativoAnterior.mesBase.mes).padStart(2, "0")}/{resumo.comparativoAnterior.mesBase.ano}
                </p>
                <p className="mt-3 text-lg font-bold text-white">
                  {formatarMoeda(resumo.comparativoAnterior.diferenca)}
                </p>
                <p className={`mt-1 text-sm font-semibold ${resumo.comparativoAnterior.diferenca <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  {resumo.comparativoAnterior.diferenca <= 0 ? "Gastou menos" : "Gastou mais"} · {formatarPercentual(resumo.comparativoAnterior.percentual)}
                </p>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Comparativo parcial
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Mesmo período do mês atual contra o mesmo intervalo do mês passado.
                </p>
                <p className="mt-3 text-lg font-bold text-white">
                  {formatarMoeda(resumo.comparativoParcial.diferenca)}
                </p>
                <p className={`mt-1 text-sm font-semibold ${resumo.comparativoParcial.diferenca <= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {resumo.comparativoParcial.diferenca <= 0 ? "Melhor que o mês passado" : "Pior que o mês passado"} · {formatarPercentual(resumo.comparativoParcial.percentual)}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300/80">
              Alertas inteligentes
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-white md:text-2xl">
              Leituras do mês
            </h2>

            <div className="mt-5 space-y-3">
              {resumo.alertas.map((alerta, index) => (
                <div
                  key={`${alerta}-${index}`}
                  className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4 text-sm leading-6 text-slate-200"
                >
                  {alerta}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                Termômetros por categoria
              </p>
              <h2 className="mt-2 text-xl font-extrabold text-white md:text-2xl">
                Onde o dinheiro está indo
              </h2>
            </div>
            {carregando && <span className="text-sm text-slate-400">Atualizando...</span>}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {resumo.categoriasConsolidadas.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                Nenhum gasto por categoria neste período.
              </div>
            ) : (
              resumo.categoriasConsolidadas.map((item) => {
                const meta = item.meta ?? 0;
                const percentualMeta = meta > 0 ? Math.min((item.totalAtual / meta) * 100, 100) : 0;
                const corBarra =
                  item.status === "crítico"
                    ? "bg-rose-500"
                    : item.status === "alto"
                    ? "bg-orange-500"
                    : item.status === "atenção"
                    ? "bg-yellow-400"
                    : "bg-emerald-500";

                return (
                  <article
                    key={item.categoria.id}
                    className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-white">{item.categoria.nome}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {formatarMoeda(item.totalAtual)} no mês
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                        {item.status}
                      </span>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${corBarra}`}
                        style={{ width: `${meta > 0 ? percentualMeta : Math.min(Math.abs(item.percentual), 100)}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                      <span>
                        {item.diferenca <= 0 ? "Menor" : "Maior"} que o mês anterior:
                        <strong className="ml-1 text-white">{formatarMoeda(Math.abs(item.diferenca))}</strong>
                      </span>
                      <span>
                        {formatarPercentual(item.percentual)}
                      </span>
                      {item.meta !== null && (
                        <span>
                          Meta: <strong className="text-white">{formatarMoeda(item.meta)}</strong>
                        </span>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
