import Link from "next/link";
import { getPlatformAccessContext } from "@/lib/platform-access/server";

export default async function Page() {
  const {
    nomeAtual,
    canAccessDashboard,
    canAccessAliado,
    hasOwnAliadoModule,
    hasOwnAliadoPessoalModule,
    hasOwnAliadoEmpresarialModule,
    canManagePlatformUsers,
  } =
    await getPlatformAccessContext();

  const nomeDestaque = nomeAtual.trim().toLocaleUpperCase("pt-BR");

  const modulos = [
    canAccessDashboard
      ? {
          titulo: "Adsync3",
          descricao: "Acompanhe operações, ROI, gestores, despesas e comissões.",
          href: "/",
          acao: "Abrir Adsync3",
          destaque:
            "border-cyan-300/25 shadow-cyan-500/10 [background-image:radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%)]",
        }
      : null,
    canAccessAliado
      ? {
          titulo: "Aliado Financeiro",
          descricao: hasOwnAliadoModule
            ? hasOwnAliadoPessoalModule && hasOwnAliadoEmpresarialModule
              ? "Organize finanças pessoais e empresariais com escopos separados."
              : hasOwnAliadoPessoalModule
              ? "Organize seu financeiro pessoal com receitas, despesas e metas."
              : "Organize seu financeiro empresarial com receitas, despesas e metas."
            : "Acesse os financeiros compartilhados com você em um só lugar.",
          href: "/aliado-financeiro",
          acao: hasOwnAliadoModule ? "Abrir Aliado Financeiro" : "Abrir Compartilhados",
          destaque:
            "border-emerald-300/25 shadow-emerald-500/10 [background-image:radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%)]",
        }
      : null,
    {
      titulo: "Configurações",
      descricao: "Gerencie seu perfil e preferências da conta.",
      href: "/configuracao",
      acao: "Abrir Configurações",
      destaque:
        "border-indigo-300/25 shadow-indigo-500/10 [background-image:radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_34%)]",
    },
    canManagePlatformUsers
      ? {
          titulo: "Add Usuário",
          descricao: "Convide usuários para acessar os módulos da plataforma.",
          href: "/add-usuario",
          acao: "Gerenciar convites",
          destaque:
            "border-fuchsia-300/25 shadow-fuchsia-500/10 [background-image:radial-gradient(circle_at_top_left,rgba(217,70,239,0.14),transparent_34%)]",
        }
      : null,
  ].filter(Boolean) as Array<{
    titulo: string;
    descricao: string;
    href: string;
    acao: string;
    destaque: string;
  }>;

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.14),transparent_30%)]" />

          <div className="relative z-10">
            <p className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-xs font-semibold uppercase tracking-[0.18em] text-transparent">
              Plataforma
            </p>
            <h1 className="mt-3 max-w-5xl text-xl font-extrabold uppercase leading-tight text-white md:text-3xl md:leading-[1.1]">
              {`OLÁ, ${nomeDestaque || "USUARIO"}! SEJA BEM-VINDO AO `}
              <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">
                ALIADO
              </span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-slate-200 md:text-lg md:leading-8">
              Grandes resultados começam com decisões inteligentes.
            </p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {modulos.map((modulo) => (
            <article
              key={modulo.titulo}
              className={`rounded-[26px] border bg-[#0b1222]/85 p-5 shadow-[0_16px_35px_rgba(2,6,23,0.4)] ${modulo.destaque}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Módulo
              </p>
              <h2 className="mt-3 text-2xl font-extrabold text-white">{modulo.titulo}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{modulo.descricao}</p>

              <Link
                href={modulo.href}
                className="mt-5 inline-flex w-fit items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                {modulo.acao}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
