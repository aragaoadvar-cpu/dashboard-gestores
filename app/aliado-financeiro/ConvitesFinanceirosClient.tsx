"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ShareItem = {
  id: string;
  invited_email: string;
  permission_level: "view" | "edit";
  status: string;
  created_at: string;
  owner_user_id: string;
  owner_nome?: string;
  escopos: Array<"pessoal" | "empresarial">;
};

type Props = {
  nomeUsuario: string;
};

export default function ConvitesFinanceirosClient({ nomeUsuario }: Props) {
  const [email, setEmail] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"view" | "edit">("view");
  const [escopos, setEscopos] = useState<Array<"pessoal" | "empresarial">>([
    "pessoal",
  ]);
  const [enviados, setEnviados] = useState<ShareItem[]>([]);
  const [recebidos, setRecebidos] = useState<ShareItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");

    const response = await fetch("/api/aliado-financeiro/convites", {
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          error?: string;
          sent?: ShareItem[];
          received?: ShareItem[];
        }
      | null;

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível carregar os convites financeiros.");
      setCarregando(false);
      return;
    }

    setEnviados(payload.sent ?? []);
    setRecebidos(payload.received ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function enviarConvite() {
    if (salvando) return;

    setErro("");
    setMensagem("");

    if (!email.trim()) {
      setErro("Informe o e-mail da pessoa convidada.");
      return;
    }

    setSalvando(true);
    const response = await fetch("/api/aliado-financeiro/convites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
        permission_level: permissionLevel,
        escopos,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string }
      | null;

    setSalvando(false);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível enviar o convite financeiro.");
      return;
    }

    setMensagem(payload.message ?? "Convite financeiro enviado com sucesso.");
    setEmail("");
    setPermissionLevel("view");
    setEscopos(["pessoal"]);
    void carregar();
  }

  function alternarEscopo(escopo: "pessoal" | "empresarial") {
    setEscopos((atual) =>
      atual.includes(escopo)
        ? atual.filter((item) => item !== escopo)
        : [...atual, escopo]
    );
  }

  async function removerAcesso(id: string) {
    const ok = window.confirm("Deseja remover este acesso compartilhado?");
    if (!ok) return;

    const response = await fetch(`/api/aliado-financeiro/convites?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível remover o acesso.");
      return;
    }

    setMensagem("Acesso removido com sucesso.");
    void carregar();
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl">
        <header className="rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Aliado Financeiro
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">
            Compartilhar Finanças
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
            Compartilhe suas informações financeiras com pessoas de confiança sem misturar isso com
            a dashboard operacional.
          </p>
          <p className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200">
            Financeiro principal de {nomeUsuario}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <h2 className="text-xl font-extrabold text-white">Enviar convite</h2>
            <p className="mt-2 text-sm text-slate-300">
              Convide alguém para apenas visualizar ou também editar seus lançamentos.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                  placeholder="convidado@email.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Permissão</label>
                <select
                  value={permissionLevel}
                  onChange={(e) => setPermissionLevel(e.target.value as "view" | "edit")}
                  className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                >
                  <option value="view">Apenas visualizar</option>
                  <option value="edit">Pode editar</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Escopos</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "pessoal" as const, label: "Pessoal" },
                    { value: "empresarial" as const, label: "Empresarial" },
                  ].map((item) => (
                    <label
                      key={item.value}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1222]/70 px-4 py-3 text-sm text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={escopos.includes(item.value)}
                        onChange={() => alternarEscopo(item.value)}
                        className="h-4 w-4 rounded border-white/20 bg-[#0b1222]"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Selecione pelo menos um escopo para compartilhar.
                </p>
              </div>

              {!!mensagem && (
                <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {mensagem}
                </div>
              )}

              {!!erro && (
                <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {erro}
                </div>
              )}

              <button
                type="button"
                onClick={() => void enviarConvite()}
                disabled={salvando}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-60"
              >
                {salvando ? "Enviando convite..." : "Enviar convite"}
              </button>
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <h2 className="text-xl font-extrabold text-white">Acessos enviados</h2>
              <div className="mt-4 space-y-3">
                {enviados.map((item) => (
                  <div key={item.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-white">{item.invited_email}</p>
                        <p className="text-sm text-slate-400">
                          {item.permission_level === "edit" ? "Pode editar" : "Apenas visualizar"} ·{" "}
                          {item.status}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.escopos.map((escopo) => (
                            <span
                              key={`${item.id}-${escopo}`}
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
                            >
                              {escopo === "empresarial" ? "Empresarial" : "Pessoal"}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void removerAcesso(item.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Remover acesso
                      </button>
                    </div>
                  </div>
                ))}

                {!carregando && enviados.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                    Você ainda não compartilhou seu financeiro com ninguém.
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <h2 className="text-xl font-extrabold text-white">Compartilhados com você</h2>
              <div className="mt-4 space-y-3">
                {recebidos.map((item) => (
                  <div key={item.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {item.owner_nome ? `Financeiro de ${item.owner_nome}` : "Financeiro compartilhado"}
                        </p>
                        <p className="text-sm text-slate-400">
                          {item.permission_level === "edit" ? "Pode editar" : "Apenas visualizar"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.escopos.map((escopo) => (
                            <span
                              key={`${item.id}-${escopo}`}
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
                            >
                              {escopo === "empresarial" ? "Empresarial" : "Pessoal"}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.escopos.map((escopo) => (
                          <Link
                            key={`${item.id}-link-${escopo}`}
                            href={`/aliado-financeiro/${escopo}?owner=${encodeURIComponent(item.owner_user_id)}`}
                            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                          >
                            {escopo === "empresarial" ? "Abrir Empresarial" : "Abrir Pessoal"}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {!carregando && recebidos.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                    Nenhum financeiro foi compartilhado com você ainda.
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
