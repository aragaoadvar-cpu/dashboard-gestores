"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ShareItem = {
  id: string;
  invited_email: string;
  permission_level: "view" | "edit";
  status: string;
  created_at: string;
  accepted_at?: string | null;
  owner_user_id: string;
  owner_nome?: string;
  escopos: Array<"pessoal" | "empresarial">;
  token?: string;
  shared_user_id?: string | null;
  shared_user_nome?: string | null;
  shared_user_email?: string | null;
};

type Props = {
  nomeUsuario: string;
};

type EditState = {
  id: string;
  nome: string | null;
  email: string;
  status: string;
  permissionLevel: "view" | "edit";
  escopos: Array<"pessoal" | "empresarial">;
};

export default function ConvitesFinanceirosClient({ nomeUsuario }: Props) {
  const [origin, setOrigin] = useState("");
  const [email, setEmail] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"view" | "edit">("view");
  const [escopos, setEscopos] = useState<Array<"pessoal" | "empresarial">>([
    "pessoal",
  ]);
  const [enviados, setEnviados] = useState<ShareItem[]>([]);
  const [recebidos, setRecebidos] = useState<ShareItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [processandoAcaoId, setProcessandoAcaoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<EditState | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  function formatarData(data: string) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(data));
  }

  function getStatusMeta(status: string) {
    if (status === "accepted") {
      return {
        label: "Ativo",
        tone: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100",
      };
    }

    if (status === "pending") {
      return {
        label: "Pendente",
        tone: "border-amber-300/25 bg-amber-500/10 text-amber-100",
      };
    }

    return {
      label: "Inativo/Revogado",
      tone: "border-white/15 bg-white/5 text-slate-200",
    };
  }

  function getPermissionLabel(permissionLevel: "view" | "edit") {
    return permissionLevel === "edit" ? "Editor" : "Visualizador";
  }

  function getScopeLabel(escoposLista: Array<"pessoal" | "empresarial">) {
    const temPessoal = escoposLista.includes("pessoal");
    const temEmpresarial = escoposLista.includes("empresarial");

    if (temPessoal && temEmpresarial) {
      return "Pessoal e Empresarial";
    }

    if (temEmpresarial) {
      return "Empresarial";
    }

    return "Pessoal";
  }

  function hasScope(escoposLista: Array<"pessoal" | "empresarial">, escopo: "pessoal" | "empresarial") {
    return escoposLista.includes(escopo);
  }

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
    setOrigin(window.location.origin);
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

  function getInviteLink(token: string) {
    if (!origin) {
      return "";
    }

    return `${origin}/convite-financeiro?token=${encodeURIComponent(token)}`;
  }

  async function copiarLinkConvite(token: string) {
    const inviteLink = getInviteLink(token);
    if (!inviteLink) {
      setErro("Não foi possível gerar o link do convite agora.");
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setMensagem("Link do convite copiado com sucesso.");
      setErro("");
    } catch {
      setErro("Não foi possível copiar o link do convite.");
    }
  }

  async function cancelarConvite(id: string) {
    const ok = window.confirm("Deseja cancelar este convite pendente?");
    if (!ok) return;

    setProcessandoAcaoId(id);
    setErro("");
    setMensagem("");

    const response = await fetch(`/api/aliado-financeiro/convites?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;

    setProcessandoAcaoId(null);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível cancelar o convite.");
      return;
    }

    setMensagem("Convite cancelado com sucesso.");
    setEnviados((atual) => atual.filter((item) => item.id !== id));
  }

  async function removerAcesso(id: string) {
    const ok = window.confirm(
      "Deseja remover o acesso dessa pessoa ao seu Aliado Financeiro?"
    );
    if (!ok) return;

    setProcessandoAcaoId(id);
    setErro("");
    setMensagem("");

    const response = await fetch(`/api/aliado-financeiro/convites?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string }
      | null;

    setProcessandoAcaoId(null);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível remover o acesso.");
      return;
    }

    setMensagem(payload.message ?? "Acesso removido com sucesso.");
    setEnviados((atual) => atual.filter((item) => item.id !== id));
  }

  function abrirEdicao(item: ShareItem) {
    setErro("");
    setMensagem("");
    setEditando({
      id: item.id,
      nome: item.shared_user_nome?.trim() || null,
      email: item.shared_user_email?.trim() || item.invited_email,
      status: item.status,
      permissionLevel: item.permission_level,
      escopos: [...item.escopos],
    });
  }

  function fecharEdicao() {
    if (salvandoEdicao) return;
    setEditando(null);
  }

  function alternarEscopoEdicao(escopo: "pessoal" | "empresarial") {
    setEditando((atual) => {
      if (!atual) return atual;

      const escoposAtuais = atual.escopos.includes(escopo)
        ? atual.escopos.filter((item) => item !== escopo)
        : [...atual.escopos, escopo];

      return {
        ...atual,
        escopos: escoposAtuais,
      };
    });
  }

  async function salvarEdicao() {
    if (!editando || salvandoEdicao) return;

    if (editando.escopos.length === 0) {
      setErro("Selecione pelo menos um escopo para compartilhar.");
      return;
    }

    setSalvandoEdicao(true);
    setErro("");
    setMensagem("");

    const response = await fetch("/api/aliado-financeiro/convites", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: editando.id,
        permission_level: editando.permissionLevel,
        escopos: editando.escopos,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string }
      | null;

    setSalvandoEdicao(false);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível atualizar o compartilhamento.");
      return;
    }

    setMensagem(payload.message ?? "Compartilhamento atualizado com sucesso.");
    setEditando(null);
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
              <h2 className="text-xl font-extrabold text-white">Pessoas com acesso ao meu Aliado</h2>
              <p className="mt-2 text-sm text-slate-300">
                Acompanhe quem recebeu seu compartilhamento, o status atual e o nível de acesso.
              </p>
              <div className="mt-4 space-y-3">
                {enviados.map((item) => (
                  <div key={item.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                    {(() => {
                      const inviteToken = item.token;
                      const inviteLink = inviteToken ? getInviteLink(inviteToken) : "";
                      const statusMeta = getStatusMeta(item.status);
                      const nomeExibido = item.shared_user_nome?.trim() || null;
                      const emailExibido = item.shared_user_email?.trim() || item.invited_email;
                      const processando = processandoAcaoId === item.id;

                      return (
                        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_140px_110px_130px_auto] xl:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-white">
                                {nomeExibido ?? emailExibido}
                              </p>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.tone}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-300">{emailExibido}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Convite em {formatarData(item.created_at)}
                            </p>
                          </div>

                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Acesso
                            </p>
                            <p className="mt-1 text-sm text-slate-200">
                              {getPermissionLabel(item.permission_level)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{getScopeLabel(item.escopos)}</p>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Pessoal
                            </p>
                            <p className="mt-1 text-sm text-slate-200">
                              {hasScope(item.escopos, "pessoal") ? "Sim" : "Nao"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Empresarial
                            </p>
                            <p className="mt-1 text-sm text-slate-200">
                              {hasScope(item.escopos, "empresarial") ? "Sim" : "Nao"}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {item.status === "pending" && inviteToken && inviteLink ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void copiarLinkConvite(inviteToken)}
                                  disabled={processando}
                                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                >
                                  Copiar link
                                </button>
                                <Link
                                  href={inviteLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                >
                                  Abrir link
                                </Link>
                              </>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => abrirEdicao(item)}
                              disabled={processando}
                              className="inline-flex items-center justify-center rounded-xl border border-sky-300/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-60"
                            >
                              Editar
                            </button>

                            {item.status === "pending" ? (
                              <button
                                type="button"
                                onClick={() => void cancelarConvite(item.id)}
                                disabled={processando}
                                className="inline-flex items-center justify-center rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                              >
                                {processando ? "Cancelando..." : "Cancelar convite"}
                              </button>
                            ) : null}

                            {item.status === "accepted" ? (
                              <button
                                type="button"
                                onClick={() => void removerAcesso(item.id)}
                                disabled={processando}
                                className="inline-flex items-center justify-center rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                              >
                                {processando ? "Removendo..." : "Remover acesso"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}

                {!carregando && enviados.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                    Você ainda não compartilhou seu Aliado Financeiro com ninguém.
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

      {editando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0a1020] p-6 shadow-[0_20px_60px_rgba(2,6,23,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300/80">
                  Compartilhamento
                </p>
                <h3 className="mt-2 text-xl font-extrabold text-white">Editar acesso</h3>
                <p className="mt-2 text-sm text-slate-300">
                  Atualize permissão e escopos sem remover o convite ou o acesso atual.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharEdicao}
                disabled={salvandoEdicao}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
                <p className="font-semibold text-white">{editando.nome ?? editando.email}</p>
                <p className="mt-1 text-sm text-slate-300">{editando.email}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {editando.status === "pending" ? "Convite pendente" : "Acesso ativo"}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Permissao</label>
                <select
                  value={editando.permissionLevel}
                  onChange={(e) =>
                    setEditando((atual) =>
                      atual
                        ? {
                            ...atual,
                            permissionLevel: e.target.value as "view" | "edit",
                          }
                        : atual
                    )
                  }
                  className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                >
                  <option value="view">Visualizador</option>
                  <option value="edit">Editor</option>
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
                        checked={editando.escopos.includes(item.value)}
                        onChange={() => alternarEscopoEdicao(item.value)}
                        className="h-4 w-4 rounded border-white/20 bg-[#0b1222]"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  E obrigatorio manter pelo menos um escopo selecionado.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={fecharEdicao}
                  disabled={salvandoEdicao}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void salvarEdicao()}
                  disabled={salvandoEdicao}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 disabled:opacity-60"
                >
                  {salvandoEdicao ? "Salvando..." : "Salvar alteracoes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
