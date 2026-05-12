"use client";

import { useEffect, useState } from "react";

type ManagedModuleKey =
  | "dashboard_ads"
  | "aliado_financeiro_pessoal"
  | "aliado_financeiro_empresarial";

type ManagedModules = {
  dashboard_ads: boolean;
  aliado_financeiro_pessoal: boolean;
  aliado_financeiro_empresarial: boolean;
};

type InviteItem = {
  id: string;
  email: string;
  nome: string | null;
  modules: string[];
  status: string;
  created_at: string;
  accepted_at: string | null;
};

type PlatformUserItem = {
  user_id: string;
  nome: string | null;
  email: string | null;
  role: "dono" | "admin" | "gestor" | "auxiliar" | null;
  is_active: boolean;
  modules: ManagedModules;
};

type UnifiedItem =
  | {
      kind: "user";
      id: string;
      nome: string | null;
      email: string | null;
      role: PlatformUserItem["role"];
      statusLabel: string;
      statusTone: "active" | "inactive";
      createdAtLabel: string | null;
      modules: ManagedModules;
      is_active: boolean;
    }
  | {
      kind: "invite";
      id: string;
      nome: string | null;
      email: string;
      role: null;
      statusLabel: string;
      statusTone: "pending" | "inactive";
      createdAtLabel: string | null;
      modules: ManagedModules;
      inviteStatus: string;
    };

type Props = {
  nomeUsuario: string;
};

export default function AddUsuarioPageClient({ nomeUsuario }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [dashboard, setDashboard] = useState(true);
  const [aliadoPessoal, setAliadoPessoal] = useState(false);
  const [aliadoEmpresarial, setAliadoEmpresarial] = useState(false);
  const [lista, setLista] = useState<InviteItem[]>([]);
  const [usuarios, setUsuarios] = useState<PlatformUserItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [atualizandoModulo, setAtualizandoModulo] = useState<string | null>(null);
  const [atualizandoStatusConta, setAtualizandoStatusConta] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");

    const [convitesResponse, usuariosResponse] = await Promise.all([
      fetch("/api/platform/invitations", { cache: "no-store" }),
      fetch("/api/platform/module-permissions", { cache: "no-store" }),
    ]);

    const convitesPayload = (await convitesResponse.json().catch(() => null)) as
      | { success?: boolean; error?: string; invitations?: InviteItem[] }
      | null;
    const usuariosPayload = (await usuariosResponse.json().catch(() => null)) as
      | { success?: boolean; error?: string; users?: PlatformUserItem[] }
      | null;

    if (!convitesResponse.ok || !convitesPayload?.success) {
      setErro(convitesPayload?.error ?? "Não foi possível carregar os convites.");
      setCarregando(false);
      return;
    }

    if (!usuariosResponse.ok || !usuariosPayload?.success) {
      setErro(usuariosPayload?.error ?? "Não foi possível carregar os usuários da plataforma.");
      setCarregando(false);
      return;
    }

    setLista(convitesPayload.invitations ?? []);
    setUsuarios(usuariosPayload.users ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function criarConvite() {
    if (salvando) return;

    setErro("");
    setMensagem("");

    const modules = [
      dashboard ? "dashboard_ads" : null,
      aliadoPessoal ? "aliado_financeiro_pessoal" : null,
      aliadoEmpresarial ? "aliado_financeiro_empresarial" : null,
    ].filter(Boolean);

    if (!nome.trim() || !email.trim()) {
      setErro("Preencha nome e e-mail.");
      return;
    }

    if (modules.length === 0) {
      setErro("Selecione pelo menos um módulo.");
      return;
    }

    setSalvando(true);
    const response = await fetch("/api/platform/invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: nome.trim(),
        email: email.trim(),
        modules,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string }
      | null;

    setSalvando(false);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível criar o convite.");
      return;
    }

    setMensagem(payload.message ?? "Convite criado com sucesso.");
    setNome("");
    setEmail("");
    setDashboard(true);
    setAliadoPessoal(false);
    setAliadoEmpresarial(false);
    void carregar();
  }

  async function atualizarModuloUsuario(
    targetUserId: string,
    moduleKey: ManagedModuleKey,
    enabled: boolean
  ) {
    const chave = `${targetUserId}:${moduleKey}`;
    setAtualizandoModulo(chave);
    setErro("");
    setMensagem("");

    const response = await fetch("/api/platform/module-permissions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: targetUserId,
        module_key: moduleKey,
        enabled,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;

    setAtualizandoModulo(null);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível atualizar a permissão.");
      return;
    }

    setMensagem("Permissão atualizada com sucesso.");
    setUsuarios((prev) =>
      prev.map((item) =>
        item.user_id === targetUserId
          ? {
              ...item,
              modules: {
                ...item.modules,
                [moduleKey]: enabled,
              },
            }
          : item
      )
    );
  }

  async function atualizarStatusConta(targetUserId: string, isActive: boolean) {
    setAtualizandoStatusConta(targetUserId);
    setErro("");
    setMensagem("");

    const response = await fetch(`/api/platform/users/${encodeURIComponent(targetUserId)}/active`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        is_active: isActive,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;

    setAtualizandoStatusConta(null);

    if (!response.ok || !payload?.success) {
      setErro(payload?.error ?? "Não foi possível atualizar o status da conta.");
      return;
    }

    setMensagem(isActive ? "Conta ativada com sucesso." : "Conta desativada com sucesso.");
    setUsuarios((prev) =>
      prev.map((item) =>
        item.user_id === targetUserId
          ? {
              ...item,
              is_active: isActive,
            }
          : item
      )
    );
  }

  const itensUnificados: UnifiedItem[] = [
    ...usuarios.map((usuario) => ({
      kind: "user" as const,
      id: usuario.user_id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      statusLabel: usuario.is_active ? "Ativo" : "Desativado",
      statusTone: usuario.is_active ? ("active" as const) : ("inactive" as const),
      createdAtLabel: null,
      modules: usuario.modules,
      is_active: usuario.is_active,
    })),
    ...lista
      .filter((invite) => {
        if (invite.status === "accepted") {
          const inviteEmail = invite.email.trim().toLowerCase();
          return !usuarios.some(
            (usuario) => (usuario.email ?? "").trim().toLowerCase() === inviteEmail
          );
        }
        return true;
      })
      .map((invite) => ({
        kind: "invite" as const,
        id: invite.id,
        nome: invite.nome,
        email: invite.email,
        role: null,
        statusLabel:
          invite.status === "pending"
            ? "Convite pendente"
            : invite.status === "accepted"
            ? "Convite aceito"
            : "Convite desativado",
        statusTone: invite.status === "pending" ? ("pending" as const) : ("inactive" as const),
        createdAtLabel: new Date(invite.created_at).toLocaleDateString("pt-BR"),
        modules: {
          dashboard_ads: invite.modules.includes("dashboard_ads"),
          aliado_financeiro_pessoal:
            invite.modules.includes("aliado_financeiro") ||
            invite.modules.includes("aliado_financeiro_pessoal"),
          aliado_financeiro_empresarial:
            invite.modules.includes("aliado_financeiro") ||
            invite.modules.includes("aliado_financeiro_empresarial"),
        },
        inviteStatus: invite.status,
      })),
  ];

  const itensFiltrados = itensUnificados.filter((item) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    const nome = (item.nome ?? "").toLowerCase();
    const emailAtual = (item.email ?? "").toLowerCase();
    const role = (item.role ?? "").toLowerCase();
    const status = item.statusLabel.toLowerCase();
    return (
      nome.includes(termo) ||
      emailAtual.includes(termo) ||
      role.includes(termo) ||
      status.includes(termo)
    );
  });

  function getRoleLabel(role: PlatformUserItem["role"]) {
    if (role === "dono") return "dono";
    if (role === "admin") return "admin";
    if (role === "auxiliar") return "auxiliar";
    if (role === "gestor") return "gestor";
    return "sem role";
  }

  function getStatusClass(tone: UnifiedItem["statusTone"]) {
    if (tone === "active") {
      return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
    }
    if (tone === "pending") {
      return "border-cyan-300/25 bg-cyan-500/10 text-cyan-100";
    }
    return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  }

  function getModuleLabel(moduleKey: ManagedModuleKey) {
    if (moduleKey === "dashboard_ads") return "Dashboard";
    if (moduleKey === "aliado_financeiro_pessoal") return "Aliado Pessoal";
    return "Aliado Empresarial";
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl">
        <header className="rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300/80">
            Ecossistema
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">Add Usuário</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
            Convide usuários para acessar os módulos da plataforma com segurança e clareza.
          </p>
          <p className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200">
            Gestão feita por {nomeUsuario}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <h2 className="text-xl font-extrabold text-white">Criar convite</h2>
            <p className="mt-2 text-sm text-slate-300">
              O convite cria o acesso ao ecossistema. O convite operacional da dashboard continua em
              <strong className="text-white"> /convites</strong>.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                  placeholder="Nome do usuário"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                  placeholder="usuario@email.com"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-300">Módulos liberados</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={dashboard}
                      onChange={(e) => setDashboard(e.target.checked)}
                    />
                    Dashboard
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={aliadoPessoal}
                      onChange={(e) => setAliadoPessoal(e.target.checked)}
                    />
                    Aliado Financeiro: Pessoal
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={aliadoEmpresarial}
                      onChange={(e) => setAliadoEmpresarial(e.target.checked)}
                    />
                    Aliado Financeiro: Empresarial
                  </label>
                </div>
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
                onClick={() => void criarConvite()}
                disabled={salvando}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 disabled:opacity-60"
              >
                {salvando ? "Criando convite..." : "Criar convite"}
              </button>
            </div>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <h2 className="text-xl font-extrabold text-white">Resumo rápido</h2>
            <p className="mt-2 text-sm text-slate-300">
              Abaixo você encontra usuários ativos, desativados e convites da plataforma em uma
              única visão.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Usuários ativos
                </p>
                <p className="mt-3 text-2xl font-extrabold text-emerald-300">
                  {usuarios.filter((item) => item.is_active).length}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Usuários desativados
                </p>
                <p className="mt-3 text-2xl font-extrabold text-rose-300">
                  {usuarios.filter((item) => !item.is_active).length}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Convites pendentes
                </p>
                <p className="mt-3 text-2xl font-extrabold text-cyan-300">
                  {lista.filter((item) => item.status === "pending").length}
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-white">Usuários da plataforma</h2>
              <p className="mt-2 text-sm text-slate-300">
                Gerencie quais módulos cada usuário do seu escopo pode acessar.
              </p>
            </div>

            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 md:max-w-sm"
              placeholder="Buscar por nome, e-mail ou role"
            />
          </div>

          <div className="mt-5 space-y-3">
            {itensFiltrados.map((item) => (
              <article
                key={`${item.kind}:${item.id}`}
                className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      {item.nome || "Usuário sem nome"}
                    </p>
                    <p className="text-sm text-slate-400">
                      {item.email || "Email não disponível"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {item.kind === "user" ? getRoleLabel(item.role) : "convite"}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusClass(
                          item.statusTone
                        )}`}
                      >
                        {item.statusLabel}
                      </span>
                      {item.createdAtLabel && (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          {item.createdAtLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                    {(
                      [
                        "dashboard_ads",
                        "aliado_financeiro_pessoal",
                        "aliado_financeiro_empresarial",
                      ] as ManagedModuleKey[]
                    ).map((moduleKey) => (
                      <label
                        key={moduleKey}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={item.modules[moduleKey]}
                          disabled={
                            item.kind !== "user" ||
                            atualizandoModulo === `${item.id}:${moduleKey}`
                          }
                          onChange={(e) =>
                            item.kind === "user"
                              ? void atualizarModuloUsuario(item.id, moduleKey, e.target.checked)
                              : undefined
                          }
                        />
                        {getModuleLabel(moduleKey)}
                      </label>
                    ))}
                  </div>
                </div>

                {item.kind === "user" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void atualizarStatusConta(item.id, !item.is_active)}
                      disabled={atualizandoStatusConta === item.id}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        item.is_active
                          ? "border border-rose-300/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                          : "border border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      } disabled:opacity-60`}
                    >
                      {atualizandoStatusConta === item.id
                        ? "Atualizando..."
                        : item.is_active
                        ? "Desativar"
                        : "Ativar"}
                    </button>
                  </div>
                )}
              </article>
            ))}

            {!carregando && itensFiltrados.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
                Nenhum usuário ou convite encontrado para este filtro.
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
