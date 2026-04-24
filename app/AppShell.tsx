"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar" | null;

type Props = {
  roleUsuario: RoleUsuario;
  children: React.ReactNode;
};

export default function AppShell({ roleUsuario, children }: Props) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/login";

  const podeVerGestores = roleUsuario === "admin" || roleUsuario === "dono";
  const podeVerConvites =
    roleUsuario === "admin" || roleUsuario === "gestor" || roleUsuario === "dono";

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

  return (
    <div className="relative flex min-h-screen flex-col bg-[#06080f] text-slate-100 lg:flex-row">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.14),transparent_36%)]" />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0f1d]/95 px-3 py-3 shadow-[0_8px_20px_rgba(2,6,23,0.35)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <h2 className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-sm font-black tracking-[0.12em] text-transparent">
            ADSYNC3
          </h2>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            Command Center
          </p>
        </div>

        <nav className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link href="/" className={`${getNavClass("/")} shrink-0 !px-3 !py-2 !text-sm`}>
            Dashboard
          </Link>
          <Link href="/operacoes" className={`${getNavClass("/operacoes")} shrink-0 !px-3 !py-2 !text-sm`}>
            Operações
          </Link>
          <Link href="/despesas" className={`${getNavClass("/despesas")} shrink-0 !px-3 !py-2 !text-sm`}>
            Despesas
          </Link>
          {podeVerGestores && (
            <Link href="/gestores" className={`${getNavClass("/gestores")} shrink-0 !px-3 !py-2 !text-sm`}>
              Gestores
            </Link>
          )}
          {podeVerConvites && (
            <Link href="/convites" className={`${getNavClass("/convites")} shrink-0 !px-3 !py-2 !text-sm`}>
              Convites
            </Link>
          )}
          <Link href="/configuracao" className={`${getNavClass("/configuracao")} shrink-0 !px-3 !py-2 !text-sm`}>
            Configurações
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
          <Link href="/" className={getNavClass("/")}>Dashboard</Link>
          <Link href="/operacoes" className={getNavClass("/operacoes")}>Operações</Link>
          <Link href="/despesas" className={getNavClass("/despesas")}>Despesas</Link>
          {podeVerGestores && (
            <Link href="/gestores" className={getNavClass("/gestores")}>Gestores</Link>
          )}
          {podeVerConvites && (
            <Link href="/convites" className={getNavClass("/convites")}>Convites</Link>
          )}
          <Link href="/configuracao" className={getNavClass("/configuracao")}>Configurações</Link>
        </nav>
      </aside>

      <main className="relative z-10 flex-1 p-3 md:p-5 lg:p-8">{children}</main>
    </div>
  );
}
