"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OwnerDashboardData } from "@/lib/dashboard/types";
import { buildHrefComPeriodo } from "@/lib/periodo";
import MonthYearPicker from "./components/MonthYearPicker";
import ResponsiveMetricValue from "./components/ResponsiveMetricValue";

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

type Props = {
  initialData: OwnerDashboardData;
  initialMes: number;
  initialAno: number;
};

export default function OwnerDashboardClient({ initialData, initialMes, initialAno }: Props) {
  const [mesSelecionado, setMesSelecionado] = useState(initialMes);
  const [anoSelecionado, setAnoSelecionado] = useState(initialAno);

  const [data, setData] = useState<OwnerDashboardData>(initialData);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroDetalhe, setErroDetalhe] = useState("");

  const nomeMesSelecionado = useMemo(() => {
    return MESES.find((item) => item.valor === mesSelecionado)?.nome || "";
  }, [mesSelecionado]);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro("");
      setErroDetalhe("");

      const url = `/api/dashboard/owner?mes=${mesSelecionado}&ano=${anoSelecionado}&debug=1`;
      console.log("[OwnerDashboardClient] useEffect disparou", {
        mesSelecionado,
        anoSelecionado,
        initialMes,
        initialAno,
        url,
      });

      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });
        const json = await response.json();

        console.log("[OwnerDashboardClient] resposta API", {
          status: response.status,
          ok: response.ok,
          success: json?.success,
          adminsLength: Array.isArray(json?.data?.admins) ? json.data.admins.length : null,
          resumoGlobal: json?.data?.resumoGlobal ?? null,
          debug: json?.data?.debug ?? null,
          error: json?.error ?? null,
        });

        if (!response.ok || !json?.success) {
          setErro(json?.error ?? "Não foi possível carregar o dashboard do dono.");
          setErroDetalhe(
            `status=${response.status}; success=${String(json?.success ?? false)}; url=${url}`
          );
          setCarregando(false);
          return;
        }

        console.log("[OwnerDashboardClient] setData chamado", {
          adminsLength: Array.isArray(json?.data?.admins) ? json.data.admins.length : null,
          resumoGlobal: json?.data?.resumoGlobal ?? null,
        });
        setData(json.data as OwnerDashboardData);
      } catch (error) {
        setErro(`Erro inesperado: ${(error as Error).message}`);
        setErroDetalhe(`url=${url}`);
        console.error("[OwnerDashboardClient] erro no fetch", error);
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
  }, [mesSelecionado, anoSelecionado, initialMes, initialAno]);

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl xl:text-5xl">
            Dashboard do Dono
          </h1>
          <p className="mt-2 text-sm text-slate-400 md:text-lg">
            Visão executiva resumida da estrutura de admins
          </p>
        </header>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/80 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <MonthYearPicker
              mes={mesSelecionado}
              ano={anoSelecionado}
              onChange={(mes, ano) => {
                setMesSelecionado(mes);
                setAnoSelecionado(ano);
              }}
              variant="dark"
            />

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 md:text-base">
              Período selecionado:{" "}
              <span className="font-semibold text-slate-100">
                {nomeMesSelecionado} {anoSelecionado}
              </span>
            </div>
          </div>

          {carregando && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Atualizando visão executiva...
            </div>
          )}

          {!!erro && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{erro}</p>
              {!!erroDetalhe && (
                <p className="mt-1 break-all text-xs text-red-600">{erroDetalhe}</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-[20px] border border-white/10 border-l-4 border-l-red-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Receita Plataforma</p>
            <ResponsiveMetricValue
              value={`R$ ${formatarNumero(data.resumoGlobal.receitaTotalPlataforma)}`}
              size="hero"
              className="mt-2 text-blue-600"
            />
          </div>
          <div className="rounded-[20px] border border-white/10 border-l-4 border-l-yellow-400 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Lucro Plataforma</p>
            <ResponsiveMetricValue
              value={`R$ ${formatarNumero(data.resumoGlobal.lucroTotalPlataforma)}`}
              size="hero"
              className="mt-2 text-green-600"
            />
          </div>
          <div className="rounded-[20px] border border-white/10 border-l-4 border-l-blue-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">ROI Global</p>
            <ResponsiveMetricValue
              value={`${formatarNumero(data.resumoGlobal.roiGlobal)}%`}
              size="hero"
              className="mt-2 text-yellow-600"
            />
          </div>
          <div className="rounded-[20px] border border-white/10 border-l-4 border-l-green-500 bg-[#0f172a]/85 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 md:text-sm">Admins Ativos</p>
            <ResponsiveMetricValue
              value={String(data.resumoGlobal.totalAdminsAtivos)}
              size="hero"
              className="mt-2 text-slate-100"
            />
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {data.admins.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-[#0f172a]/70 px-4 py-6 text-sm text-slate-300">
              Nenhum admin encontrado para o período.
            </div>
          )}

          {data.admins.map((admin) => (
            <article
              key={admin.adminId}
              className="rounded-[24px] border border-gray-200 card-white-modern p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-black">{admin.nome}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Célula administrativa
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getBadgeSaude(
                    admin.statusSaude
                  )}`}
                >
                  {admin.statusSaude}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                    Operação Própria
                  </p>
                  <p className="mt-2 text-sm text-gray-700">Operações: {admin.proprio.totalOperacoes}</p>
                  <p className="text-sm text-gray-700">Receita: R$ {formatarNumero(admin.proprio.receita)}</p>
                  <p className={`text-sm font-semibold ${getLucroClass(admin.proprio.lucro)}`}>
                    Lucro: R$ {formatarNumero(admin.proprio.lucro)}
                  </p>
                  <p className={`text-sm font-semibold ${getRoiClass(admin.proprio.roi)}`}>
                    ROI: {formatarNumero(admin.proprio.roi)}%
                  </p>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                    Equipe
                  </p>
                  <p className="mt-2 text-sm text-gray-700">Gestores ativos: {admin.equipe.totalGestoresAtivos}</p>
                  <p className="text-sm text-gray-700">Operações: {admin.equipe.totalOperacoes}</p>
                  <p className="text-sm text-gray-700">Receita: R$ {formatarNumero(admin.equipe.receita)}</p>
                  <p className={`text-sm font-semibold ${getLucroClass(admin.equipe.lucro)}`}>
                    Lucro: R$ {formatarNumero(admin.equipe.lucro)}
                  </p>
                  <p className={`text-sm font-semibold ${getRoiClass(admin.equipe.roi)}`}>
                    ROI equipe: {formatarNumero(admin.equipe.roi)}%
                  </p>
                </section>

                <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                    Consolidado da Célula
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-800">
                    Receita: R$ {formatarNumero(admin.consolidado.receita)}
                  </p>
                  <p className={`text-sm font-bold ${getLucroClass(admin.consolidado.lucro)}`}>
                    Lucro: R$ {formatarNumero(admin.consolidado.lucro)}
                  </p>
                  <p className={`text-sm font-bold ${getRoiClass(admin.consolidado.roi)}`}>
                    ROI: {formatarNumero(admin.consolidado.roi)}%
                  </p>
                </section>
              </div>

              <section className="mt-4 rounded-2xl border border-gray-200 card-white-modern p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
                  Alertas Rápidos
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {admin.alertasRapidos.map((alerta, index) => (
                    <span
                      key={`${admin.adminId}-alerta-${index}`}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${getAlertaClass(alerta)}`}
                    >
                      {alerta}
                    </span>
                  ))}
                </div>
              </section>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/admins/${encodeURIComponent(admin.adminId)}?mes=${mesSelecionado}&ano=${anoSelecionado}`}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                >
                  Ver detalhes do admin
                </Link>
                <Link
                  href={buildHrefComPeriodo("/gestores", {
                    mes: mesSelecionado,
                    ano: anoSelecionado,
                  })}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                >
                  Ver gestores
                </Link>
                <Link
                  href={buildHrefComPeriodo(
                    "/operacoes",
                    { mes: mesSelecionado, ano: anoSelecionado },
                    { owner_id: admin.adminId }
                  )}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                >
                  Ver operações
                </Link>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
