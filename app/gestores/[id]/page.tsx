import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import GestorDetalhePageClient from "./GestorDetalhePageClient";
import { getOwnerGestorDetail } from "@/lib/dashboard/getOwnerGestorDetail";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    mes?: string;
    ano?: string;
  }>;
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

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBadgeSaude(status: "Saudável" | "Atenção" | "Crítico") {
  if (status === "Saudável") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "Atenção") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-rose-300 bg-rose-50 text-rose-800";
}

function getRoiClass(valor: number) {
  if (valor < 0) return "text-rose-700";
  if (valor < 30) return "text-amber-700";
  return "text-emerald-700";
}

function getLucroClass(valor: number) {
  return valor < 0 ? "text-rose-700" : "text-emerald-700";
}

function getAlertaClass(alerta: string) {
  const texto = alerta.toLowerCase();
  if (texto.includes("prejuízo") || texto.includes("baixo")) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (texto.includes("nenhuma")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getOperacaoItemClass(lucro: number, roi: number) {
  if (lucro < 0 || roi < 0) return "border-rose-200 bg-rose-50";
  if (roi < 30) return "border-amber-200 bg-amber-50";
  return "border-gray-200 bg-gray-50";
}

function parseMesAno(mesParam?: string, anoParam?: string) {
  const now = new Date();
  const mesNum = Number(mesParam);
  const anoNum = Number(anoParam);

  const mes = Number.isFinite(mesNum) && mesNum >= 1 && mesNum <= 12 ? mesNum : now.getMonth() + 1;
  const ano = Number.isFinite(anoNum) && anoNum >= 2000 && anoNum <= 2100 ? anoNum : now.getFullYear();

  return { mes, ano };
}

function getServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createSupabaseClient(supabaseUrl as string, serviceRoleKey as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id: gestorId } = await params;
  const query = await searchParams;
  const { mes, ano } = parseMesAno(query?.mes, query?.ano);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role, nome")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    redirect("/");
  }

  const roleUsuario =
    profileData.role === "dono"
      ? "dono"
      : profileData.role === "admin"
      ? "admin"
      : "gestor";

  if (roleUsuario === "gestor") {
    redirect("/");
  }

  const nomeAtual = profileData.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

  if (roleUsuario === "dono") {
    const serviceSupabase = getServiceSupabaseClient();
    if (!serviceSupabase) {
      return (
        <main className="min-h-screen bg-[#f3f4f6] p-4 md:p-6 xl:p-8">
          <section className="mx-auto max-w-7xl rounded-[24px] border border-red-200 bg-red-50 p-6 text-red-700">
            Dashboard do dono indisponível: configure `SUPABASE_SERVICE_ROLE_KEY` no servidor.
          </section>
        </main>
      );
    }

    const detalhe = await getOwnerGestorDetail({
      supabase: serviceSupabase,
      gestorId,
      mes,
      ano,
    });

    if (!detalhe) {
      redirect("/");
    }

    const nomeMes = MESES.find((item) => item.valor === detalhe.periodo.mes)?.nome || "";
    const periodoLabel = `${MESES.find((item) => item.valor === detalhe.periodo.mes)?.label}/${detalhe.periodo.ano}`;

    return (
      <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={
                detalhe.adminResponsavel.adminId
                  ? `/admins/${encodeURIComponent(detalhe.adminResponsavel.adminId)}?mes=${detalhe.periodo.mes}&ano=${detalhe.periodo.ano}`
                  : "/"
              }
              className="rounded-xl border border-white/20 bg-[#0b1222] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Voltar para o admin
            </Link>
            <Link
              href={`/operacoes?owner_id=${encodeURIComponent(detalhe.gestorId)}`}
              className="rounded-xl border border-white/20 bg-[#0b1222] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Ver operações do gestor
            </Link>
          </div>

          <header className="mt-4 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl">
                  {detalhe.gestorNome}
                </h1>
                <p className="mt-1 text-sm text-slate-400 md:text-base">
                  Admin responsável: {detalhe.adminResponsavel.adminNome}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  Período: <strong className="text-slate-100">{periodoLabel}</strong>
                </span>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getBadgeSaude(
                    detalhe.statusSaude
                  )}`}
                >
                  {detalhe.statusSaude}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Visão real do gestor no período de {nomeMes} {detalhe.periodo.ano}
            </p>
          </header>

          <section className="mt-6 rounded-[24px] border border-gray-200 card-white-modern p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Resumo Executivo do Gestor
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-[20px] border-l-4 border-red-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Operações no período</p>
              <p className="mt-2 text-lg font-extrabold text-black">{detalhe.totais.totalOperacoes}</p>
            </div>
            <div className="rounded-[20px] border-l-4 border-yellow-400 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Receita total</p>
              <p className="mt-2 text-lg font-extrabold text-blue-600">
                R$ {formatarNumero(detalhe.totais.receita)}
              </p>
            </div>
            <div className="rounded-[20px] border-l-4 border-blue-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Custo total</p>
              <p className="mt-2 text-lg font-extrabold text-red-600">
                R$ {formatarNumero(detalhe.totais.custo)}
              </p>
            </div>
            <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Lucro total</p>
              <p className={`mt-2 text-lg font-extrabold ${getLucroClass(detalhe.totais.lucro)}`}>
                R$ {formatarNumero(detalhe.totais.lucro)}
              </p>
            </div>
            <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">ROI do período</p>
              <p className={`mt-2 text-lg font-extrabold ${getRoiClass(detalhe.totais.roi)}`}>
                {formatarNumero(detalhe.totais.roi)}%
              </p>
            </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] card-white-modern p-5 shadow-sm">
            <h2 className="text-xl font-extrabold text-black">Alertas rápidos</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {detalhe.alertasRapidos.map((alerta, index) => (
                <span
                  key={`alerta-${index}`}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${getAlertaClass(alerta)}`}
                >
                  {alerta}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-[24px] card-white-modern p-5 shadow-sm">
            <h2 className="text-xl font-extrabold text-black">Operações do gestor no período</h2>

            {detalhe.operacoes.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
                Nenhuma operação encontrada para este gestor no período.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {detalhe.operacoes.map((operacao) => (
                  <article
                    key={operacao.operacaoId}
                    className={`rounded-2xl border p-4 ${getOperacaoItemClass(
                      operacao.lucro,
                      operacao.roi
                    )}`}
                  >
                    <h3 className="text-lg font-extrabold text-black">{operacao.nomeOperacao}</h3>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700 md:grid-cols-5">
                      <p>Receita: R$ {formatarNumero(operacao.receita)}</p>
                      <p>Custo: R$ {formatarNumero(operacao.custo)}</p>
                      <p className={`font-semibold ${getLucroClass(operacao.lucro)}`}>
                        Lucro: R$ {formatarNumero(operacao.lucro)}
                      </p>
                      <p className={`font-semibold ${getRoiClass(operacao.roi)}`}>
                        ROI: {formatarNumero(operacao.roi)}%
                      </p>
                    </div>
                    <div className="mt-3">
                      <Link
                        href={`/operacao/${operacao.operacaoId}?mes=${detalhe.periodo.mes}&ano=${detalhe.periodo.ano}`}
                        className="inline-flex rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                      >
                        Ver operação
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  }

  const { data: gestorProfile, error: gestorProfileError } = await supabase
    .from("profiles")
    .select("id, nome, role")
    .eq("id", gestorId)
    .maybeSingle();

  if (gestorProfileError || !gestorProfile || gestorProfile.role !== "gestor") {
    redirect("/gestores");
  }

  if (roleUsuario === "admin") {
    const { data: vinculoData, error: vinculoError } = await supabase
      .from("admin_gestores")
      .select("id")
      .eq("admin_user_id", user.id)
      .eq("gestor_user_id", gestorId)
      .eq("status", "ativo")
      .maybeSingle();

    if (vinculoError || !vinculoData) {
      redirect("/gestores");
    }
  }

  return (
    <GestorDetalhePageClient
      gestorId={gestorProfile.id}
      gestorNome={gestorProfile.nome}
      gestorEmail={null}
    />
  );
}
