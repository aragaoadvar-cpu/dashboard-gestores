"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MonthYearPicker from "@/app/components/MonthYearPicker";
import { createClient } from "@/lib/supabase/client";
import { garantirCategoriasFinanceirasPadrao } from "@/lib/aliado-financeiro/defaults";
import type { FinanceiroEscopo } from "@/lib/aliado-financeiro/types";
import {
  formatarMoeda,
  getFinanceiroEscopoLabel,
  getPeriodoMes,
} from "@/lib/aliado-financeiro/utils";
import { buildHrefComPeriodo, getMesAnoFromSearchParams } from "@/lib/periodo";

type ScopeSummary = {
  receitas: number;
  despesas: number;
  saldo: number;
};

type SharedItem = {
  id: string;
  owner_user_id: string;
  owner_nome: string;
  permission_level: "view" | "edit";
  escopos: FinanceiroEscopo[];
  resumos: Partial<Record<FinanceiroEscopo, ScopeSummary>>;
};

type Props = {
  authUserId: string;
  nomeUsuario: string;
  hasOwnAliadoModule: boolean;
  hasOwnAliadoPessoalModule: boolean;
  hasOwnAliadoEmpresarialModule: boolean;
};

const escopos: FinanceiroEscopo[] = ["pessoal", "empresarial"];

function resumoVazio(): ScopeSummary {
  return { receitas: 0, despesas: 0, saldo: 0 };
}

export default function AliadoFinanceiroHomeClient({
  authUserId,
  nomeUsuario,
  hasOwnAliadoModule,
  hasOwnAliadoPessoalModule,
  hasOwnAliadoEmpresarialModule,
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
  const [resumoProprio, setResumoProprio] = useState<Partial<Record<FinanceiroEscopo, ScopeSummary>>>({});
  const [compartilhados, setCompartilhados] = useState<SharedItem[]>([]);

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
      const { inicio, fim } = getPeriodoMes(mesSelecionado, anoSelecionado);
      const inicioIso = inicio.toISOString().slice(0, 10);
      const fimIso = fim.toISOString().slice(0, 10);

      if (hasOwnAliadoModule) {
        const escoposProprios = escopos.filter((escopo) =>
          escopo === "pessoal" ? hasOwnAliadoPessoalModule : hasOwnAliadoEmpresarialModule
        );
        await Promise.all(
          escoposProprios.map((escopo) => garantirCategoriasFinanceirasPadrao(supabase, authUserId, escopo))
        );
      }

      const sharedResp = await supabase
        .from("financeiro_shared_access")
        .select("id, owner_user_id, permission_level, escopos")
        .eq("shared_user_id", authUserId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });

      if (sharedResp.error) throw sharedResp.error;

      const ownerIds = Array.from(new Set((sharedResp.data ?? []).map((item) => item.owner_user_id)));
      const profilesResp =
        ownerIds.length > 0
          ? await supabase.from("profiles").select("id, nome").in("id", ownerIds)
          : { data: [], error: null };

      if (profilesResp.error) throw profilesResp.error;

      const nomesPorOwner = new Map(
        (profilesResp.data ?? []).map((item) => [item.id, item.nome?.trim() || "outro usuário"])
      );

      const carregarResumo = async (ownerUserId: string, escopo: FinanceiroEscopo) => {
        const { data, error } = await supabase
          .from("financeiro_lancamentos")
          .select("tipo, valor")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .gte("data", inicioIso)
          .lte("data", fimIso);

        if (error) throw error;

        const receitas = (data ?? [])
          .filter((item) => item.tipo === "receita")
          .reduce((acc, item) => acc + Number(item.valor ?? 0), 0);
        const despesas = (data ?? [])
          .filter((item) => item.tipo === "despesa")
          .reduce((acc, item) => acc + Number(item.valor ?? 0), 0);

        return {
          receitas,
          despesas,
          saldo: receitas - despesas,
        };
      };

      if (hasOwnAliadoModule) {
        const proprioEntries = await Promise.all(
          escopos
            .filter((escopo) =>
              escopo === "pessoal" ? hasOwnAliadoPessoalModule : hasOwnAliadoEmpresarialModule
            )
            .map(async (escopo) => [escopo, await carregarResumo(authUserId, escopo)] as const)
        );
        setResumoProprio(Object.fromEntries(proprioEntries));
      } else {
        setResumoProprio({});
      }

      const compartilhadosData = await Promise.all(
        (sharedResp.data ?? []).map(async (item) => {
          const allowedScopes = ((item.escopos ?? []) as string[]).filter(
            (scope): scope is FinanceiroEscopo => scope === "pessoal" || scope === "empresarial"
          );

          const resumoEntries = await Promise.all(
            allowedScopes.map(async (escopo) => [escopo, await carregarResumo(item.owner_user_id, escopo)] as const)
          );

          return {
            id: item.id,
            owner_user_id: item.owner_user_id,
            owner_nome: nomesPorOwner.get(item.owner_user_id) ?? "outro usuário",
            permission_level: item.permission_level === "edit" ? "edit" : "view",
            escopos: allowedScopes,
            resumos: Object.fromEntries(resumoEntries),
          } satisfies SharedItem;
        })
      );

      setCompartilhados(compartilhadosData);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o Aliado Financeiro.");
    } finally {
      setCarregando(false);
    }
  }, [
    anoSelecionado,
    authUserId,
    hasOwnAliadoEmpresarialModule,
    hasOwnAliadoModule,
    hasOwnAliadoPessoalModule,
    mesSelecionado,
    supabase,
  ]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function buildScopeHref(destino: string, escopo: FinanceiroEscopo, owner?: string) {
    return buildHrefComPeriodo(
      destino,
      {
        mes: mesSelecionado,
        ano: anoSelecionado,
      },
      {
        ...(owner ? { owner } : {}),
        escopo,
      }
    );
  }

  const temCompartilhados = compartilhados.length > 0;

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl">
        <header className="rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                Aliado Financeiro
              </p>
              <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">
                Centro financeiro
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                {nomeUsuario}, separe seu controle entre financeiro pessoal, empresarial e acessos compartilhados.
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

        {hasOwnAliadoModule && (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Meu Aliado Financeiro
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-white">Seus escopos próprios</h2>
              </div>

              <Link
                href="/aliado-financeiro/convites"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Compartilhar Financeiro
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {escopos
                .filter((escopo) =>
                  escopo === "pessoal" ? hasOwnAliadoPessoalModule : hasOwnAliadoEmpresarialModule
                )
                .map((escopo) => {
                const resumo = resumoProprio[escopo] ?? resumoVazio();
                return (
                  <article
                    key={escopo}
                    className="rounded-[26px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                      {getFinanceiroEscopoLabel(escopo)}
                    </p>
                    <h3 className="mt-2 text-2xl font-extrabold text-white">
                      {getFinanceiroEscopoLabel(escopo)}
                    </h3>

                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-[18px] border border-white/10 bg-[#0b1222]/75 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Receitas</p>
                        <p className="mt-2 text-sm font-bold text-emerald-300">
                          {formatarMoeda(resumo.receitas)}
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-[#0b1222]/75 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Despesas</p>
                        <p className="mt-2 text-sm font-bold text-rose-300">
                          {formatarMoeda(resumo.despesas)}
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-[#0b1222]/75 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Saldo</p>
                        <p className="mt-2 text-sm font-bold text-cyan-300">
                          {formatarMoeda(resumo.saldo)}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={buildScopeHref(`/aliado-financeiro/${escopo}`, escopo)}
                      className="mt-5 inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      Abrir {getFinanceiroEscopoLabel(escopo)}
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Compartilhados comigo
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-white">Financeiros compartilhados</h2>
          </div>

          <div className="mt-4 space-y-4">
            {!carregando && !temCompartilhados && !hasOwnAliadoModule && (
              <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                Você não tem Aliado Financeiro próprio nem compartilhamentos ativos no momento.
              </div>
            )}

            {!carregando && !temCompartilhados && hasOwnAliadoModule && (
              <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                Nenhum financeiro foi compartilhado com você ainda.
              </div>
            )}

            {compartilhados.map((item) => (
              <article
                key={item.id}
                className="rounded-[26px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-xl font-extrabold text-white">
                      Financeiro de {item.owner_nome}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {item.permission_level === "edit" ? "Pode editar" : "Apenas visualizar"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {item.escopos.map((escopo) => {
                    const resumo = item.resumos[escopo] ?? resumoVazio();
                    return (
                      <div
                        key={`${item.id}-${escopo}`}
                        className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-100">
                            {getFinanceiroEscopoLabel(escopo)}
                          </p>
                          <Link
                            href={buildScopeHref(`/aliado-financeiro/${escopo}`, escopo, item.owner_user_id)}
                            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                          >
                            Abrir
                          </Link>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-[16px] border border-white/10 bg-[#09101d]/80 p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Receitas</p>
                            <p className="mt-1 text-sm font-bold text-emerald-300">
                              {formatarMoeda(resumo.receitas)}
                            </p>
                          </div>
                          <div className="rounded-[16px] border border-white/10 bg-[#09101d]/80 p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Despesas</p>
                            <p className="mt-1 text-sm font-bold text-rose-300">
                              {formatarMoeda(resumo.despesas)}
                            </p>
                          </div>
                          <div className="rounded-[16px] border border-white/10 bg-[#09101d]/80 p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Saldo</p>
                            <p className="mt-1 text-sm font-bold text-cyan-300">
                              {formatarMoeda(resumo.saldo)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
