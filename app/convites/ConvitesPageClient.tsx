"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RoleUsuario = "dono" | "admin" | "gestor";
type InviteType = "admin" | "gestor" | "auxiliar";
type InviteStatus = "pending" | "accepted" | "expired" | "revoked" | "active_linked";

type Convite = {
  id: string;
  invited_email: string;
  invite_type: InviteType;
  status: InviteStatus;
  created_at: string;
  accepted_at: string | null;
  accepted_by_user_id?: string | null;
  gestor_user_id?: string | null;
  auxiliar_user_id?: string | null;
  revoked_at: string | null;
  expires_at: string;
  can_revoke: boolean;
};

const PERMANENT_EXPIRES_AT = "2099-12-31T23:59:59.000Z";

type GestorAtivo = {
  gestor_user_id: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  admin_user_id: string;
  admin_nome: string | null;
  vinculado_em: string;
  tem_convite_aceito: boolean;
};
type AuxiliarAtivo = {
  auxiliar_user_id: string;
  auxiliar_nome: string | null;
  auxiliar_email: string | null;
  owner_user_id: string;
  owner_nome: string | null;
  owner_role: "admin" | "gestor" | null;
  vinculado_em: string;
  tem_convite_aceito: boolean;
};

type OperacaoPermissaoAuxiliar = {
  id: number;
  nome: string;
  mes: number;
  ano: number;
  permitida: boolean;
};

function formatarData(dataIso: string | null) {
  if (!dataIso) return "-";
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return "-";
  return data.toLocaleString("pt-BR");
}

function formatarExpiracao(dataIso: string | null, status: InviteStatus) {
  if (status === "accepted" || status === "active_linked") return "Sem expiração";
  if (!dataIso) return "Sem expiração";
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return "Sem expiração";
  if (data.getFullYear() >= 2099) return "Sem expiração";
  return data.toLocaleString("pt-BR");
}

function getStatusStyle(status: InviteStatus) {
  if (status === "accepted") return "bg-green-100 text-green-700 border-green-200";
  if (status === "pending") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (status === "revoked") return "bg-red-100 text-red-700 border-red-200";
  if (status === "active_linked") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function getStatusLabel(status: InviteStatus) {
  if (status === "accepted") return "Aceito";
  if (status === "pending") return "Pendente";
  if (status === "revoked") return "Revogado";
  if (status === "active_linked") return "Vínculo ativo";
  return "Expirado";
}

export default function ConvitesPageClient() {
  const [roleUsuario, setRoleUsuario] = useState<RoleUsuario>("admin");
  const [convites, setConvites] = useState<Convite[]>([]);
  const [gestoresAtivos, setGestoresAtivos] = useState<GestorAtivo[]>([]);
  const [auxiliaresAtivos, setAuxiliaresAtivos] = useState<AuxiliarAtivo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [emailConvite, setEmailConvite] = useState("");
  const [criandoConvite, setCriandoConvite] = useState(false);
  const [tipoConviteAdmin, setTipoConviteAdmin] = useState<"gestor" | "auxiliar">("gestor");
  const [linkFallbackAtual, setLinkFallbackAtual] = useState("");
  const [statusEnvioEmail, setStatusEnvioEmail] = useState("");
  const [revogandoConviteId, setRevogandoConviteId] = useState<string | null>(null);
  const [copiandoConviteId, setCopiandoConviteId] = useState<string | null>(null);
  const [reenviandoConviteId, setReenviandoConviteId] = useState<string | null>(null);
  const [inativandoUsuarioId, setInativandoUsuarioId] = useState<string | null>(null);
  const [auxiliarGerenciandoId, setAuxiliarGerenciandoId] = useState<string | null>(null);
  const [auxiliarGerenciandoLabel, setAuxiliarGerenciandoLabel] = useState("");
  const [permissoesOperacoesAuxiliar, setPermissoesOperacoesAuxiliar] = useState<
    OperacaoPermissaoAuxiliar[]
  >([]);
  const [carregandoPermissoes, setCarregandoPermissoes] = useState(false);
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false);

  const tipoConviteDaTela: InviteType =
    roleUsuario === "dono"
      ? "admin"
      : roleUsuario === "admin"
      ? tipoConviteAdmin
      : "auxiliar";

  const tituloConvite = useMemo(
    () =>
      tipoConviteDaTela === "admin"
        ? "Convidar admin"
        : tipoConviteDaTela === "gestor"
        ? "Convidar gestor"
        : "Convidar auxiliar",
    [tipoConviteDaTela]
  );

  const itensListaConvites = useMemo(() => {
    const convitesSemRevogados = convites.filter((convite) => convite.status !== "revoked");
    const convitesBase = [...convitesSemRevogados];

    const usuariosJaRepresentados = new Set(
      convitesSemRevogados
        .map((convite) => convite.accepted_by_user_id)
        .filter((id): id is string => Boolean(id))
    );

    for (const gestor of gestoresAtivos) {
      if (usuariosJaRepresentados.has(gestor.gestor_user_id)) continue;

      const email = gestor.gestor_email?.trim() || `ID: ${gestor.gestor_user_id}`;

      convitesBase.push({
        id: `active-${gestor.gestor_user_id}`,
        invited_email: email,
        invite_type: "gestor",
        status: "active_linked",
        created_at: gestor.vinculado_em,
        accepted_at: gestor.vinculado_em,
        accepted_by_user_id: gestor.gestor_user_id,
        gestor_user_id: gestor.gestor_user_id,
        revoked_at: null,
        expires_at: PERMANENT_EXPIRES_AT,
        can_revoke: false,
      });
    }

    for (const auxiliar of auxiliaresAtivos) {
      if (usuariosJaRepresentados.has(auxiliar.auxiliar_user_id)) continue;

      const email = auxiliar.auxiliar_email?.trim() || `ID: ${auxiliar.auxiliar_user_id}`;

      convitesBase.push({
        id: `active-aux-${auxiliar.auxiliar_user_id}`,
        invited_email: email,
        invite_type: "auxiliar",
        status: "active_linked",
        created_at: auxiliar.vinculado_em,
        accepted_at: auxiliar.vinculado_em,
        accepted_by_user_id: auxiliar.auxiliar_user_id,
        auxiliar_user_id: auxiliar.auxiliar_user_id,
        revoked_at: null,
        expires_at: PERMANENT_EXPIRES_AT,
        can_revoke: false,
      });
    }

    return convitesBase.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [convites, gestoresAtivos, auxiliaresAtivos]);

  const carregarConvites = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const response = await fetch("/api/invitations", { method: "GET" });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível carregar os convites.");
        setCarregando(false);
        return;
      }

      const role =
        data.role === "dono" ? "dono" : data.role === "admin" ? "admin" : "gestor";
      setRoleUsuario(role);
      setConvites((data.invites as Convite[]) || []);
      setGestoresAtivos((data.gestores_ativos as GestorAtivo[]) || []);
      setAuxiliaresAtivos((data.auxiliares_ativos as AuxiliarAtivo[]) || []);
    } catch (error) {
      setErro(`Erro inesperado ao carregar convites: ${(error as Error).message}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarConvites();
  }, [carregarConvites]);

  async function criarConvite() {
    const email = emailConvite.trim();

    setErro("");
    setMensagem("");
    setStatusEnvioEmail("");
    setLinkFallbackAtual("");

    if (!email) {
      setErro("Digite um email válido para convidar.");
      return;
    }

    setCriandoConvite(true);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          invite_type: tipoConviteDaTela,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível criar o convite.");
        setCriandoConvite(false);
        return;
      }

      setEmailConvite("");
      setMensagem("Convite criado com sucesso.");

      const inviteLink = data.invite_link ?? "";
      if (inviteLink) {
        setLinkFallbackAtual(inviteLink);
      }

      const delivery = data.email_delivery as
        | { status?: string; message?: string }
        | undefined;

      if (delivery?.status === "sent") {
        setStatusEnvioEmail("Convite criado e email enviado com sucesso.");
      } else if (delivery?.status === "not_configured") {
        setStatusEnvioEmail(
          "Convite criado com sucesso. Envio de email não configurado; use o link manual abaixo."
        );
      } else if (delivery?.status === "failed") {
        setStatusEnvioEmail(
          "Convite criado, mas houve falha no envio do email. Use o link manual abaixo."
        );
      } else {
        setStatusEnvioEmail("Convite criado com sucesso.");
      }

      await carregarConvites();
    } catch (error) {
      setErro(`Erro inesperado ao criar convite: ${(error as Error).message}`);
    } finally {
      setCriandoConvite(false);
    }
  }

  async function solicitarNovoLink(conviteId: string) {
    const response = await fetch("/api/invitations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "regenerate_link",
        invite_id: conviteId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Não foi possível gerar um novo link para o convite.");
    }

    return data.invite_link as string;
  }

  async function copiarLink(convite: Convite) {
    setErro("");
    setMensagem("");
    setStatusEnvioEmail("");
    setLinkFallbackAtual("");
    setCopiandoConviteId(convite.id);

    try {
      const link = await solicitarNovoLink(convite.id);
      await navigator.clipboard.writeText(link);
      setLinkFallbackAtual(link);
      setMensagem("Link atualizado e copiado com sucesso.");
      await carregarConvites();
    } catch (error) {
      setErro(`Não foi possível copiar o link: ${(error as Error).message}`);
    } finally {
      setCopiandoConviteId(null);
    }
  }

  async function revogarConvite(convite: Convite) {
    if (convite.status !== "pending") return;

    const confirmar = window.confirm(
      `Deseja revogar o convite para ${convite.invited_email}?`
    );
    if (!confirmar) return;

    setErro("");
    setMensagem("");
    setRevogandoConviteId(convite.id);

    try {
      const response = await fetch("/api/invitations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "revoke",
          invite_id: convite.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível revogar o convite.");
        setRevogandoConviteId(null);
        return;
      }

      setMensagem("Convite revogado com sucesso.");
      await carregarConvites();
    } catch (error) {
      setErro(`Erro inesperado ao revogar convite: ${(error as Error).message}`);
    } finally {
      setRevogandoConviteId(null);
    }
  }

  async function reenviarConvite(convite: Convite) {
    if (convite.status !== "pending") return;

    setErro("");
    setMensagem("");
    setStatusEnvioEmail("");
    setReenviandoConviteId(convite.id);

    try {
      const link = await solicitarNovoLink(convite.id);
      setLinkFallbackAtual(link);
      setStatusEnvioEmail(
        "Reenvio preparado. O link foi renovado e está disponível abaixo para envio manual."
      );
      setMensagem("Convite atualizado para reenvio.");
      await carregarConvites();
    } catch (error) {
      setErro(`Não foi possível preparar o reenvio: ${(error as Error).message}`);
    } finally {
      setReenviandoConviteId(null);
    }
  }

  async function inativarUsuario(userId: string, tipo: InviteType, label: string) {
    const confirmar = window.confirm(`Deseja inativar ${label} da equipe?`);
    if (!confirmar) return;

    setErro("");
    setMensagem("");
    setInativandoUsuarioId(userId);

    try {
      const endpoint =
        tipo === "gestor"
          ? `/api/gestores/${encodeURIComponent(userId)}`
          : `/api/auxiliares/${encodeURIComponent(userId)}`;

      const payload =
        tipo === "gestor" ? { action: "remover_gestor" } : { action: "remover_auxiliar" };

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível inativar o usuário.");
        setInativandoUsuarioId(null);
        return;
      }

      setMensagem("Usuário inativado com sucesso.");
      await carregarConvites();
    } catch (error) {
      setErro(`Erro ao inativar usuário: ${(error as Error).message}`);
    } finally {
      setInativandoUsuarioId(null);
    }
  }

  async function abrirGerenciarOperacoes(auxiliarId: string, label: string) {
    setErro("");
    setMensagem("");
    setAuxiliarGerenciandoId(auxiliarId);
    setAuxiliarGerenciandoLabel(label);
    setPermissoesOperacoesAuxiliar([]);
    setCarregandoPermissoes(true);

    try {
      const response = await fetch(`/api/auxiliares/${encodeURIComponent(auxiliarId)}/operacoes`, {
        method: "GET",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível carregar permissões de operações do auxiliar.");
        setAuxiliarGerenciandoId(null);
        setAuxiliarGerenciandoLabel("");
        setCarregandoPermissoes(false);
        return;
      }

      setPermissoesOperacoesAuxiliar(
        ((data.operacoes as OperacaoPermissaoAuxiliar[]) || []).sort((a, b) => {
          if (a.ano !== b.ano) return b.ano - a.ano;
          if (a.mes !== b.mes) return b.mes - a.mes;
          return a.nome.localeCompare(b.nome, "pt-BR");
        })
      );
    } catch (error) {
      setErro(`Erro ao carregar permissões de operações: ${(error as Error).message}`);
      setAuxiliarGerenciandoId(null);
      setAuxiliarGerenciandoLabel("");
    } finally {
      setCarregandoPermissoes(false);
    }
  }

  function fecharGerenciarOperacoes() {
    if (salvandoPermissoes) return;
    setAuxiliarGerenciandoId(null);
    setAuxiliarGerenciandoLabel("");
    setPermissoesOperacoesAuxiliar([]);
    setCarregandoPermissoes(false);
  }

  function alternarPermissaoOperacao(operacaoId: number) {
    setPermissoesOperacoesAuxiliar((atual) =>
      atual.map((item) =>
        item.id === operacaoId ? { ...item, permitida: !item.permitida } : item
      )
    );
  }

  async function salvarPermissoesOperacoes() {
    if (!auxiliarGerenciandoId) return;

    setErro("");
    setMensagem("");
    setSalvandoPermissoes(true);

    try {
      const idsPermitidos = permissoesOperacoesAuxiliar
        .filter((item) => item.permitida)
        .map((item) => item.id);

      const response = await fetch(
        `/api/auxiliares/${encodeURIComponent(auxiliarGerenciandoId)}/operacoes`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ operacao_ids_permitidas: idsPermitidos }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        setErro(data?.error ?? "Não foi possível salvar permissões do auxiliar.");
        setSalvandoPermissoes(false);
        return;
      }

      setMensagem("Permissões de operações atualizadas com sucesso.");
      setSalvandoPermissoes(false);
      fecharGerenciarOperacoes();
    } catch (error) {
      setErro(`Erro ao salvar permissões: ${(error as Error).message}`);
      setSalvandoPermissoes(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl xl:text-5xl">
            Convites
          </h1>
          <p className="mt-2 text-sm text-slate-400 md:text-lg">
            Central de gestão de convites ({roleUsuario})
          </p>
        </header>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <h2 className="text-lg font-extrabold text-slate-100 md:text-2xl">{tituloConvite}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {tipoConviteDaTela === "admin"
              ? "Como dono, você cria convites para novos admins."
              : tipoConviteDaTela === "gestor"
              ? "Como admin, você cria convites para novos gestores."
              : roleUsuario === "admin"
              ? "Como admin, você cria convites para auxiliares da sua operação."
              : "Como gestor, você cria convites para auxiliares da sua operação."}
          </p>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            {roleUsuario === "admin" && (
              <select
                value={tipoConviteAdmin}
                onChange={(e) => setTipoConviteAdmin(e.target.value as "gestor" | "auxiliar")}
                className="w-full rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-slate-100 md:max-w-[180px]"
              >
                <option value="gestor">Gestor</option>
                <option value="auxiliar">Auxiliar</option>
              </select>
            )}
            <input
              type="email"
              value={emailConvite}
              onChange={(e) => setEmailConvite(e.target.value)}
              placeholder="usuario@email.com"
              className="w-full rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-slate-100"
            />
            <button
              type="button"
              onClick={criarConvite}
              disabled={criandoConvite}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 md:text-base"
            >
              {criandoConvite ? "Criando..." : "Convidar"}
            </button>
          </div>

          {!!statusEnvioEmail && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {statusEnvioEmail}
            </div>
          )}

          {!!linkFallbackAtual && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Link de convite (fallback manual)
              </p>
              <a
                href={linkFallbackAtual}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-medium text-cyan-300 underline"
              >
                {linkFallbackAtual}
              </a>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <h2 className="text-lg font-extrabold text-slate-100 md:text-2xl">Lista de convites</h2>
          <p className="mt-1 text-sm text-slate-400">
            {roleUsuario === "admin"
              ? "Exibindo convites de gestor e auxiliar criados por você."
              : roleUsuario === "gestor"
              ? "Exibindo convites de auxiliar criados por você."
              : "Exibindo convites de admin."}
          </p>

          {!!mensagem && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {mensagem}
            </div>
          )}

          {!!erro && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {carregando && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 px-4 py-3 text-sm text-slate-300">
                Carregando convites...
              </div>
            )}

            {!carregando && itensListaConvites.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-[#0b1222]/60 px-4 py-6 text-sm text-slate-300">
                Nenhum convite encontrado.
              </div>
            )}

            {!carregando &&
              itensListaConvites.map((convite) => (
                <article
                  key={convite.id}
                  className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm"
                >
                  {(() => {
                    const userVinculadoId =
                      convite.auxiliar_user_id ??
                      (convite.invite_type === "auxiliar" ? convite.accepted_by_user_id ?? null : null) ??
                      convite.gestor_user_id ??
                      (convite.invite_type === "gestor" ? convite.accepted_by_user_id ?? null : null);

                    const podeInativarGestor =
                      roleUsuario === "admin" &&
                      convite.invite_type === "gestor" &&
                      !!userVinculadoId &&
                      (convite.status === "accepted" || convite.status === "active_linked");

                    const podeInativarAuxiliar =
                      (roleUsuario === "admin" || roleUsuario === "gestor") &&
                      convite.invite_type === "auxiliar" &&
                      !!userVinculadoId &&
                      (convite.status === "accepted" || convite.status === "active_linked");

                    const podeInativar =
                      podeInativarGestor || podeInativarAuxiliar;

                    return (
                      <>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{convite.invited_email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tipo: <span className="font-semibold">{convite.invite_type}</span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                        convite.status
                      )}`}
                    >
                      {getStatusLabel(convite.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 md:grid-cols-3">
                    <p>
                      <span className="font-semibold text-slate-700">Criado em:</span>{" "}
                      {formatarData(convite.created_at)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Aceito em:</span>{" "}
                      {formatarData(convite.accepted_at)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Expira em:</span>{" "}
                      {formatarExpiracao(convite.expires_at, convite.status)}
                    </p>
                  </div>

                  {convite.status === "pending" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copiarLink(convite)}
                        disabled={copiandoConviteId === convite.id}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {copiandoConviteId === convite.id ? "Copiando..." : "Copiar link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => reenviarConvite(convite)}
                        disabled={reenviandoConviteId === convite.id}
                        className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        {reenviandoConviteId === convite.id
                          ? "Preparando..."
                          : "Reenviar convite"}
                      </button>
                      <button
                        type="button"
                        onClick={() => revogarConvite(convite)}
                        disabled={revogandoConviteId === convite.id || !convite.can_revoke}
                        className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        {revogandoConviteId === convite.id ? "Revogando..." : "Revogar convite"}
                      </button>
                    </div>
                  )}
                  {podeInativar && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {podeInativarAuxiliar && userVinculadoId && (
                        <button
                          type="button"
                          onClick={() =>
                            abrirGerenciarOperacoes(
                              userVinculadoId as string,
                              convite.invited_email
                            )
                          }
                          className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          Gerenciar operações
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          inativarUsuario(userVinculadoId as string, convite.invite_type, convite.invited_email)
                        }
                        disabled={inativandoUsuarioId === userVinculadoId}
                        className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        {inativandoUsuarioId === userVinculadoId ? "Inativando..." : "Inativar usuário"}
                      </button>
                    </div>
                  )}
                      </>
                    );
                  })()}
                </article>
              ))}
          </div>
        </section>
      </section>

      {auxiliarGerenciandoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0f172a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-100 md:text-xl">
                  Gerenciar operações do auxiliar
                </h3>
                <p className="mt-1 text-sm text-slate-400">{auxiliarGerenciandoLabel}</p>
              </div>

              <button
                type="button"
                onClick={fecharGerenciarOperacoes}
                disabled={salvandoPermissoes}
                className="rounded-xl border border-white/20 bg-[#0b1222] px-3 py-1 text-sm font-semibold text-slate-100 disabled:opacity-60"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-[#0b1222]/70 p-4">
              {carregandoPermissoes && (
                <p className="text-sm text-slate-300">Carregando operações...</p>
              )}

              {!carregandoPermissoes && permissoesOperacoesAuxiliar.length === 0 && (
                <p className="text-sm text-slate-300">
                  Nenhuma operação encontrada para este owner.
                </p>
              )}

              {!carregandoPermissoes && permissoesOperacoesAuxiliar.length > 0 && (
                <div className="max-h-[45vh] space-y-2 overflow-auto pr-1">
                  {permissoesOperacoesAuxiliar.map((operacao) => (
                    <label
                      key={operacao.id}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#0f172a]/80 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{operacao.nome}</p>
                        <p className="text-xs text-slate-400">
                          {String(operacao.mes).padStart(2, "0")}/{operacao.ano} • ID #{operacao.id}
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={operacao.permitida}
                        onChange={() => alternarPermissaoOperacao(operacao.id)}
                        className="h-4 w-4 accent-cyan-500"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={fecharGerenciarOperacoes}
                disabled={salvandoPermissoes}
                className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarPermissoesOperacoes}
                disabled={salvandoPermissoes || carregandoPermissoes}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvandoPermissoes ? "Salvando..." : "Salvar permissões"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
