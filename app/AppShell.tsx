"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildHrefComPeriodo, getPeriodoQueryFromSearchParams } from "@/lib/periodo";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar" | null;

type Props = {
  roleUsuario: RoleUsuario;
  canAccessDashboard: boolean;
  canAccessAliado: boolean;
  hasOwnAliadoModule: boolean;
  hasOwnAliadoPessoalModule: boolean;
  hasOwnAliadoEmpresarialModule: boolean;
  canManagePlatformUsers: boolean;
  children: React.ReactNode;
};

export default function AppShell({
  roleUsuario,
  canAccessDashboard,
  canAccessAliado,
  hasOwnAliadoModule,
  hasOwnAliadoPessoalModule,
  hasOwnAliadoEmpresarialModule,
  canManagePlatformUsers,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const hideSidebar =
    pathname === "/login" ||
    pathname === "/conta-desativada" ||
    pathname.startsWith("/convite-plataforma") ||
    pathname.startsWith("/convite-financeiro");
  const usarShellAliado = pathname.startsWith("/aliado-financeiro");
  const usarShellPlataforma =
    pathname === "/inicio" || pathname === "/configuracao" || pathname === "/add-usuario";
  const estaNaTelaInicio = pathname === "/inicio";
  const [saindo, setSaindo] = useState(false);

  const podeVerGestores = roleUsuario === "admin" || roleUsuario === "dono";
  const podeVerConvites =
    roleUsuario === "admin" || roleUsuario === "gestor" || roleUsuario === "dono";
  const periodoAtual = getPeriodoQueryFromSearchParams(searchParams);
  const ownerAtual = searchParams.get("owner")?.trim() ?? "";
  const escopoAtual = pathname.startsWith("/aliado-financeiro/empresarial")
    ? "empresarial"
    : "pessoal";
  const podeAbrirDetalhesAliado = hasOwnAliadoModule || Boolean(ownerAtual);
  const aliadoNoHub = pathname === "/aliado-financeiro";
  const aliadoNosConvites = pathname === "/aliado-financeiro/convites";
  const aliadoNoPessoal = pathname.startsWith("/aliado-financeiro/pessoal");
  const aliadoNoEmpresarial = pathname.startsWith("/aliado-financeiro/empresarial");
  const aliadoBaseAtual = aliadoNoEmpresarial
    ? "/aliado-financeiro/empresarial"
    : "/aliado-financeiro/pessoal";

  function getHrefTemporal(destino: string) {
    return buildHrefComPeriodo(destino, periodoAtual);
  }

  function getHrefAliado(destino: string) {
    return buildHrefComPeriodo(
      destino,
      {
        mes: periodoAtual.mes,
        ano: periodoAtual.ano,
      },
      {
        ...(ownerAtual && destino !== "/aliado-financeiro/convites"
          ? { owner: ownerAtual }
          : {}),
      }
    );
  }

  function getHrefAliadoOuHub(destino: string) {
    return podeAbrirDetalhesAliado ? getHrefAliado(destino) : getHrefAliado("/aliado-financeiro");
  }

  function getHrefAliadoEscopo(subrota: "" | "/despesas" | "/ganhos" | "/categorias" | "/relatorios", escopo?: "pessoal" | "empresarial") {
    const base = escopo === "empresarial" ? "/aliado-financeiro/empresarial" : "/aliado-financeiro/pessoal";
    return getHrefAliadoOuHub(`${base}${subrota}`);
  }

  const hrefHubAliado = getHrefAliado("/aliado-financeiro");

  useEffect(() => {
    setSaindo(false);
  }, [pathname, roleUsuario]);

  if (hideSidebar) {
    return <>{children}</>;
  }

  function isAtivo(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function getNavClass(href: string) {
    const ativo = isAtivo(href);
    if (ativo) {
      return "rounded-2xl border border-blue-400/75 bg-blue-500/15 px-4 py-3 text-base font-bold text-blue-200 shadow-[0_0_0_2px_rgba(59,130,246,0.8)]";
    }
    return "rounded-2xl border border-transparent px-4 py-3 text-base font-semibold text-slate-200 transition hover:border-blue-400/35 hover:bg-blue-500/10 hover:text-blue-200";
  }

  function getPlatformNavClass(href: string) {
    const ativo = isAtivo(href);
    if (ativo) {
      return "rounded-2xl border border-cyan-300/55 bg-cyan-400/10 px-4 py-3 text-base font-bold text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]";
    }
    return "rounded-2xl border border-transparent px-4 py-3 text-base font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/8 hover:text-cyan-100";
  }

  function getAliadoNavClass(href: string) {
    const ativo = isAtivo(href);
    if (ativo) {
      return "rounded-2xl border border-emerald-300/55 bg-emerald-400/10 px-4 py-3 text-base font-bold text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]";
    }
    return "rounded-2xl border border-transparent px-4 py-3 text-base font-semibold text-slate-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/8 hover:text-emerald-100";
  }

  async function sairDaConta() {
    if (saindo) return;
    try {
      setSaindo(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Erro ao sair:", error);
    } finally {
      setSaindo(false);
    }
  }

  if (usarShellPlataforma) {
    return (
      <div className="relative flex min-h-screen flex-col bg-[#06080f] text-slate-100 lg:flex-row">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.12),transparent_32%)]" />

        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0f1d]/95 px-2 py-1.5 shadow-[0_8px_20px_rgba(2,6,23,0.35)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-1.5">
            <h2 className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-[11px] font-black tracking-[0.08em] text-transparent">
              ADSYNC3
            </h2>
            <p className="text-[8px] uppercase tracking-[0.1em] text-slate-400">
              Platform
            </p>
          </div>

          <nav className="mt-1.5 -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {canAccessDashboard && (
              <Link href="/" className={`${getPlatformNavClass("/")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Dashboard
              </Link>
            )}
            {canAccessAliado && (
              <Link href={getHrefAliado("/aliado-financeiro")} className={`${getPlatformNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Aliado Financeiro
              </Link>
            )}
            <Link href="/configuracao" className={`${getPlatformNavClass("/configuracao")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
              Configurações
            </Link>
            {canManagePlatformUsers && (
              <Link href="/add-usuario" className={`${getPlatformNavClass("/add-usuario")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Add Usuário
              </Link>
            )}
            {!estaNaTelaInicio && (
              <Link href="/inicio" className={`${getPlatformNavClass("/inicio")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Voltar
              </Link>
            )}
            {estaNaTelaInicio && (
              <button
                type="button"
                onClick={sairDaConta}
                disabled={saindo}
                className="shrink-0 inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saindo ? "Saindo..." : "Sair"}
              </button>
            )}
          </nav>
        </header>

        <aside className="relative z-10 hidden w-72 border-r border-white/10 bg-[#0a0f1d]/95 p-6 shadow-[0_0_35px_rgba(15,23,42,0.8)] lg:block">
          <h2 className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-xl font-black tracking-[0.12em] text-transparent">
            ADSYNC3
          </h2>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">
            Platform Modules
          </p>

          <nav className="mt-8 flex flex-col gap-2">
            {canAccessDashboard && (
              <Link href="/" className={getPlatformNavClass("/")}>
                Dashboard
              </Link>
            )}
            {canAccessAliado && (
              <Link href={getHrefAliado("/aliado-financeiro")} className={getPlatformNavClass("/aliado-financeiro")}>
                Aliado Financeiro
              </Link>
            )}
            <Link href="/configuracao" className={getPlatformNavClass("/configuracao")}>
              Configurações
            </Link>
            {canManagePlatformUsers && (
              <Link href="/add-usuario" className={getPlatformNavClass("/add-usuario")}>
                Add Usuário
              </Link>
            )}
            {!estaNaTelaInicio && (
              <Link href="/inicio" className={getPlatformNavClass("/inicio")}>
                Voltar
              </Link>
            )}
            {estaNaTelaInicio && (
              <button
                type="button"
                onClick={sairDaConta}
                disabled={saindo}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saindo ? "Saindo..." : "Sair"}
              </button>
            )}
          </nav>
        </aside>

        <main className="relative z-10 flex-1 p-2.5 md:p-5 lg:p-8">{children}</main>
      </div>
    );
  }

  if (usarShellAliado) {
    return (
      <div className="relative flex min-h-screen flex-col bg-[#06080f] text-slate-100 lg:flex-row">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.12),transparent_32%)]" />

        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0f1d]/95 px-2 py-1.5 shadow-[0_8px_20px_rgba(2,6,23,0.35)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-1.5">
            <h2 className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-[11px] font-black tracking-[0.08em] text-transparent">
              ADSYNC3
            </h2>
            <p className="text-[8px] uppercase tracking-[0.1em] text-slate-400">
              Aliado Financeiro
            </p>
          </div>

          <nav className="mt-1.5 -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {aliadoNoHub && (
              <>
                {hasOwnAliadoPessoalModule && (
                  <Link href={getHrefAliadoOuHub("/aliado-financeiro/pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                    Pessoal
                  </Link>
                )}
                {hasOwnAliadoEmpresarialModule && (
                  <Link href={getHrefAliadoOuHub("/aliado-financeiro/empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                    Empresarial
                  </Link>
                )}
                {hasOwnAliadoModule && (
                  <Link href="/aliado-financeiro/convites" className={`${getAliadoNavClass("/aliado-financeiro/convites")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                    Compartilhar
                  </Link>
                )}
              </>
            )}
            {aliadoNoPessoal && (
              <>
                <Link href={hrefHubAliado} className={`${getAliadoNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Início
                </Link>
                <Link href={getHrefAliadoEscopo("", "pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Visão Pessoal
                </Link>
                <Link href={getHrefAliadoEscopo("/despesas", "pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal/despesas")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Despesas
                </Link>
                <Link href={getHrefAliadoEscopo("/ganhos", "pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal/ganhos")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Ganhos
                </Link>
                <Link href={getHrefAliadoEscopo("/categorias", "pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal/categorias")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Categorias
                </Link>
                <Link href={getHrefAliadoEscopo("/relatorios", "pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal/relatorios")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Relatórios
                </Link>
              </>
            )}
            {aliadoNoEmpresarial && (
              <>
                <Link href={hrefHubAliado} className={`${getAliadoNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Início
                </Link>
                <Link href={getHrefAliadoEscopo("", "empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Visão Empresarial
                </Link>
                <Link href={getHrefAliadoEscopo("/despesas", "empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial/despesas")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Despesas
                </Link>
                <Link href={getHrefAliadoEscopo("/ganhos", "empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial/ganhos")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Ganhos
                </Link>
                <Link href={getHrefAliadoEscopo("/categorias", "empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial/categorias")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Categorias
                </Link>
                <Link href={getHrefAliadoEscopo("/relatorios", "empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial/relatorios")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Relatórios
                </Link>
              </>
            )}
            {pathname === "/aliado-financeiro" ? (
              <Link href="/inicio" className={`${getAliadoNavClass("/inicio")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Voltar
              </Link>
            ) : aliadoNosConvites ? (
              <>
                <Link href={hrefHubAliado} className={`${getAliadoNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Início
                </Link>
                {hasOwnAliadoPessoalModule && (
                  <Link href={getHrefAliadoOuHub("/aliado-financeiro/pessoal")} className={`${getAliadoNavClass("/aliado-financeiro/pessoal")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                    Pessoal
                  </Link>
                )}
                {hasOwnAliadoEmpresarialModule && (
                  <Link href={getHrefAliadoOuHub("/aliado-financeiro/empresarial")} className={`${getAliadoNavClass("/aliado-financeiro/empresarial")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                    Empresarial
                  </Link>
                )}
                <Link href={hrefHubAliado} className={`${getAliadoNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                  Voltar
                </Link>
              </>
            ) : (
              <Link href={hrefHubAliado} className={`${getAliadoNavClass("/aliado-financeiro")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
                Voltar
              </Link>
            )}
          </nav>
        </header>

        <aside className="relative z-10 hidden w-72 border-r border-white/10 bg-[#0a0f1d]/95 p-6 shadow-[0_0_35px_rgba(15,23,42,0.8)] lg:block">
          <h2 className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-xl font-black tracking-[0.12em] text-transparent">
            ADSYNC3
          </h2>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">
            Aliado Financeiro
          </p>

          <nav className="mt-8 flex flex-col gap-2">
            {aliadoNoHub && (
              <>
                {hasOwnAliadoPessoalModule && (
                  <Link
                    href={getHrefAliadoOuHub("/aliado-financeiro/pessoal")}
                    className={getAliadoNavClass("/aliado-financeiro/pessoal")}
                  >
                    Pessoal
                  </Link>
                )}
                {hasOwnAliadoEmpresarialModule && (
                  <Link
                    href={getHrefAliadoOuHub("/aliado-financeiro/empresarial")}
                    className={getAliadoNavClass("/aliado-financeiro/empresarial")}
                  >
                    Empresarial
                  </Link>
                )}
                {hasOwnAliadoModule && (
                  <Link
                    href="/aliado-financeiro/convites"
                    className={getAliadoNavClass("/aliado-financeiro/convites")}
                  >
                    Compartilhar
                  </Link>
                )}
              </>
            )}
            {aliadoNoPessoal && (
              <>
                <Link
                  href={hrefHubAliado}
                  className={getAliadoNavClass("/aliado-financeiro")}
                >
                  Início
                </Link>
                <Link
                  href={getHrefAliadoEscopo("", "pessoal")}
                  className={getAliadoNavClass("/aliado-financeiro/pessoal")}
                >
                  Visão Pessoal
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/despesas", "pessoal")}
                  className={getAliadoNavClass("/aliado-financeiro/pessoal/despesas")}
                >
                  Despesas
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/ganhos", "pessoal")}
                  className={getAliadoNavClass("/aliado-financeiro/pessoal/ganhos")}
                >
                  Ganhos
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/categorias", "pessoal")}
                  className={getAliadoNavClass("/aliado-financeiro/pessoal/categorias")}
                >
                  Categorias
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/relatorios", "pessoal")}
                  className={getAliadoNavClass("/aliado-financeiro/pessoal/relatorios")}
                >
                  Relatórios
                </Link>
              </>
            )}
            {aliadoNoEmpresarial && (
              <>
                <Link
                  href={hrefHubAliado}
                  className={getAliadoNavClass("/aliado-financeiro")}
                >
                  Início
                </Link>
                <Link
                  href={getHrefAliadoEscopo("", "empresarial")}
                  className={getAliadoNavClass("/aliado-financeiro/empresarial")}
                >
                  Visão Empresarial
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/despesas", "empresarial")}
                  className={getAliadoNavClass("/aliado-financeiro/empresarial/despesas")}
                >
                  Despesas
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/ganhos", "empresarial")}
                  className={getAliadoNavClass("/aliado-financeiro/empresarial/ganhos")}
                >
                  Ganhos
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/categorias", "empresarial")}
                  className={getAliadoNavClass("/aliado-financeiro/empresarial/categorias")}
                >
                  Categorias
                </Link>
                <Link
                  href={getHrefAliadoEscopo("/relatorios", "empresarial")}
                  className={getAliadoNavClass("/aliado-financeiro/empresarial/relatorios")}
                >
                  Relatórios
                </Link>
              </>
            )}
            {pathname === "/aliado-financeiro" ? (
              <Link href="/inicio" className={getAliadoNavClass("/inicio")}>
                Voltar
              </Link>
            ) : aliadoNosConvites ? (
              <>
                <Link
                  href={hrefHubAliado}
                  className={getAliadoNavClass("/aliado-financeiro")}
                >
                  Início
                </Link>
                {hasOwnAliadoPessoalModule && (
                  <Link
                    href={getHrefAliadoOuHub("/aliado-financeiro/pessoal")}
                    className={getAliadoNavClass("/aliado-financeiro/pessoal")}
                  >
                    Pessoal
                  </Link>
                )}
                {hasOwnAliadoEmpresarialModule && (
                  <Link
                    href={getHrefAliadoOuHub("/aliado-financeiro/empresarial")}
                    className={getAliadoNavClass("/aliado-financeiro/empresarial")}
                  >
                    Empresarial
                  </Link>
                )}
                <Link href={hrefHubAliado} className={getAliadoNavClass("/aliado-financeiro")}>
                  Voltar
                </Link>
              </>
            ) : (
              <Link href={hrefHubAliado} className={getAliadoNavClass("/aliado-financeiro")}>
                Voltar
              </Link>
            )}
          </nav>
        </aside>

        <main className="relative z-10 flex-1 p-2.5 md:p-5 lg:p-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#06080f] text-slate-100 lg:flex-row">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.14),transparent_36%)]" />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0f1d]/95 px-2 py-1.5 shadow-[0_8px_20px_rgba(2,6,23,0.35)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-[11px] font-black tracking-[0.08em] text-transparent">
            ADSYNC3
          </h2>
          <p className="text-[8px] uppercase tracking-[0.1em] text-slate-400">
            Command Center
          </p>
        </div>

        <nav className="mt-1.5 -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link href={getHrefTemporal("/")} className={`${getNavClass("/")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
            Dashboard
          </Link>
          <Link href={getHrefTemporal("/operacoes")} className={`${getNavClass("/operacoes")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
            Operações
          </Link>
          <Link href={getHrefTemporal("/despesas")} className={`${getNavClass("/despesas")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
            Despesas
          </Link>
          {podeVerGestores && (
            <Link href={getHrefTemporal("/gestores")} className={`${getNavClass("/gestores")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
              Gestores
            </Link>
          )}
          {podeVerConvites && (
            <Link href="/convites" className={`${getNavClass("/convites")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
              Convites
            </Link>
          )}
          <Link href="/inicio" className={`${getNavClass("/inicio")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
            Voltar
          </Link>
        </nav>
      </header>

      <aside className="relative z-10 hidden w-72 border-r border-white/10 bg-[#0a0f1d]/95 p-6 shadow-[0_0_35px_rgba(15,23,42,0.8)] lg:block">
        <h2 className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-xl font-black tracking-[0.12em] text-transparent">
          ADSYNC3
        </h2>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">
          Command Center
        </p>

        <nav className="mt-8 flex flex-col gap-2">
          <Link href={getHrefTemporal("/")} className={getNavClass("/")}>Dashboard</Link>
          <Link href={getHrefTemporal("/operacoes")} className={getNavClass("/operacoes")}>Operações</Link>
          <Link href={getHrefTemporal("/despesas")} className={getNavClass("/despesas")}>Despesas</Link>
          {podeVerGestores && (
            <Link href={getHrefTemporal("/gestores")} className={getNavClass("/gestores")}>Gestores</Link>
          )}
          {podeVerConvites && (
            <Link href="/convites" className={getNavClass("/convites")}>Convites</Link>
          )}
          <Link href="/inicio" className={getNavClass("/inicio")}>Voltar</Link>
        </nav>
      </aside>

      <main className="relative z-10 flex-1 p-2.5 md:p-5 lg:p-8">{children}</main>
    </div>
  );
}
