import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getOwnerAdminDetail } from "@/lib/dashboard/getOwnerAdminDetail";

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
  if (status === "Saudável") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (status === "Atenção") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
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
  if (
    texto.includes("prejuízo") ||
    texto.includes("negativa") ||
    texto.includes("crítico") ||
    texto.includes("abaixo")
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (texto.includes("sem operação") || texto.includes("atenção")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
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
  const { id: adminId } = await params;
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

  if (profileError || !profileData || profileData.role !== "dono") {
    redirect("/");
  }

  const nomeAtual = profileData.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

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

  const detalhe = await getOwnerAdminDetail({
    supabase: serviceSupabase,
    adminId,
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
            href="/"
              className="rounded-xl border border-white/20 bg-[#0b1222] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Voltar para dashboard
          </Link>
          <div className="flex flex-wrap gap-2">
            {MESES.map((item) => (
              <Link
                key={item.valor}
                href={`/admins/${encodeURIComponent(adminId)}?mes=${item.valor}&ano=${detalhe.periodo.ano}`}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                  item.valor === detalhe.periodo.mes
                    ? "border-cyan-400 bg-cyan-500 text-white"
                    : "border-white/20 bg-[#0b1222] text-slate-100 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <header className="mt-4 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl">
                {detalhe.adminNome}
              </h1>
              <p className="mt-1 text-sm text-slate-400 md:text-base">
                Detalhe da célula do admin — {nomeMes} {detalhe.periodo.ano}
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
        </header>

        <section className="mt-6 rounded-[24px] border border-gray-200 card-white-modern p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            Operação Própria e Equipe
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-[20px] border-l-4 border-red-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Receita própria</p>
            <p className="mt-2 text-lg font-extrabold text-blue-600">R$ {formatarNumero(detalhe.proprio.receita)}</p>
          </div>
          <div className="rounded-[20px] border-l-4 border-yellow-400 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Lucro próprio</p>
            <p className={`mt-2 text-lg font-extrabold ${getLucroClass(detalhe.proprio.lucro)}`}>
              R$ {formatarNumero(detalhe.proprio.lucro)}
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-blue-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">ROI próprio</p>
            <p className={`mt-2 text-lg font-extrabold ${getRoiClass(detalhe.proprio.roi)}`}>
              {formatarNumero(detalhe.proprio.roi)}%
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Receita equipe</p>
            <p className="mt-2 text-lg font-extrabold text-blue-600">R$ {formatarNumero(detalhe.equipe.receita)}</p>
          </div>
          <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Lucro equipe</p>
            <p className={`mt-2 text-lg font-extrabold ${getLucroClass(detalhe.equipe.lucro)}`}>
              R$ {formatarNumero(detalhe.equipe.lucro)}
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">ROI equipe</p>
            <p className={`mt-2 text-lg font-extrabold ${getRoiClass(detalhe.equipe.roi)}`}>
              {formatarNumero(detalhe.equipe.roi)}%
            </p>
          </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">
            Consolidado da Célula
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-[20px] border-l-4 border-red-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Receita consolidada</p>
            <p className="mt-2 text-lg font-extrabold text-blue-600">
              R$ {formatarNumero(detalhe.consolidado.receita)}
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-yellow-400 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Lucro consolidado</p>
            <p className={`mt-2 text-lg font-extrabold ${getLucroClass(detalhe.consolidado.lucro)}`}>
              R$ {formatarNumero(detalhe.consolidado.lucro)}
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-blue-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">ROI consolidado</p>
            <p className={`mt-2 text-lg font-extrabold ${getRoiClass(detalhe.consolidado.roi)}`}>
              {formatarNumero(detalhe.consolidado.roi)}%
            </p>
          </div>
          <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Gestores ativos</p>
            <p className="mt-2 text-lg font-extrabold text-black">{detalhe.equipe.totalGestoresAtivos}</p>
          </div>
          <div className="rounded-[20px] border-l-4 border-green-500 card-white-modern p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">Operações da célula</p>
            <p className="mt-2 text-lg font-extrabold text-black">{detalhe.consolidado.totalOperacoes}</p>
          </div>
          </div>
        </section>

        <section className="mt-6 rounded-[24px] card-white-modern p-5 shadow-sm">
          <h2 className="text-xl font-extrabold text-black">Alertas rápidos da célula</h2>
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
          <h2 className="text-xl font-extrabold text-black">Gestores vinculados no período</h2>

          {detalhe.gestores.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
              Nenhum gestor ativo vinculado para este admin.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {detalhe.gestores.map((gestor) => (
                <article
                  key={gestor.gestorId}
                  className={`rounded-2xl border p-4 ${
                    gestor.status === "Crítico"
                      ? "border-rose-200 bg-rose-50"
                      : gestor.status === "Atenção"
                      ? "border-amber-200 bg-amber-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-extrabold text-black">{gestor.nome}</h3>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getBadgeSaude(
                        gestor.status
                      )}`}
                    >
                      {gestor.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <p>Operações: {gestor.totalOperacoes}</p>
                    <p className={`font-semibold ${getRoiClass(gestor.roi)}`}>
                      ROI: {formatarNumero(gestor.roi)}%
                    </p>
                    <p>Receita: R$ {formatarNumero(gestor.receita)}</p>
                    <p className={`font-semibold ${getLucroClass(gestor.lucro)}`}>
                      Lucro: R$ {formatarNumero(gestor.lucro)}
                    </p>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/gestores/${encodeURIComponent(gestor.gestorId)}?mes=${detalhe.periodo.mes}&ano=${detalhe.periodo.ano}`}
                      className="inline-flex rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                    >
                      Ver detalhe do gestor
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
