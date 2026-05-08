"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildHrefComPeriodo, getPeriodoQueryFromSearchParams } from "@/lib/periodo";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar" | null;

type Props = {
  roleUsuario: RoleUsuario;
  children: React.ReactNode;
};

export default function AppShell({ roleUsuario, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const hideSidebar = pathname === "/login";
  const [saindo, setSaindo] = useState(false);

  const podeVerGestores = roleUsuario === "admin" || roleUsuario === "dono";
  const podeVerConvites =
    roleUsuario === "admin" || roleUsuario === "gestor" || roleUsuario === "dono";
  const periodoAtual = getPeriodoQueryFromSearchParams(searchParams);

  function getHrefTemporal(destino: string) {
    return buildHrefComPeriodo(destino, periodoAtual);
  }

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
          <Link href="/configuracao" className={`${getNavClass("/configuracao")} shrink-0 !rounded-lg !border !px-2 !py-1 !text-[11px] !font-semibold`}>
            Configurações
          </Link>
          <button
            type="button"
            onClick={sairDaConta}
            disabled={saindo}
            className="shrink-0 inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saindo ? "Saindo..." : "Sair"}
          </button>
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
          <Link href="/configuracao" className={getNavClass("/configuracao")}>Configurações</Link>
          <button
            type="button"
            onClick={sairDaConta}
            disabled={saindo}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saindo ? "Saindo..." : "Sair"}
          </button>
        </nav>
      </aside>

      <main className="relative z-10 flex-1 p-2.5 md:p-5 lg:p-8">{children}</main>
    </div>
  );
}
