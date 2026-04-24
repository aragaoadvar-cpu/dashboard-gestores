import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/invitations/email";
import { generateInviteToken, hashInviteToken } from "@/lib/invitations/token";

type InviteType = "admin" | "gestor" | "auxiliar";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";
const PERMANENT_EXPIRES_AT = "2099-12-31T23:59:59.000Z";
type GestorAtivoResumo = {
  gestor_user_id: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  admin_user_id: string;
  admin_nome: string | null;
  vinculado_em: string;
  tem_convite_aceito: boolean;
};
type AuxiliarAtivoResumo = {
  auxiliar_user_id: string;
  auxiliar_nome: string | null;
  auxiliar_email: string | null;
  owner_user_id: string;
  owner_nome: string | null;
  owner_role: "admin" | "gestor" | null;
  vinculado_em: string;
  tem_convite_aceito: boolean;
};

function isInviteType(value: unknown): value is InviteType {
  return value === "admin" || value === "gestor" || value === "auxiliar";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function getUserRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profileData) {
    return {
      role: null,
      error: profileError?.message ?? "Perfil não encontrado.",
    };
  }

  const role: RoleUsuario =
    profileData.role === "dono"
      ? "dono"
      : profileData.role === "admin"
      ? "admin"
      : profileData.role === "auxiliar"
      ? "auxiliar"
      : "gestor";

  return { role, error: null };
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  let body: { email?: string; invite_type?: InviteType };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const inviteType = body.invite_type;

  if (!email) {
    return Response.json(
      { success: false, error: "Email é obrigatório." },
      { status: 400 }
    );
  }

  if (!isInviteType(inviteType)) {
    return Response.json(
      { success: false, error: "invite_type deve ser 'admin', 'gestor' ou 'auxiliar'." },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const { data: canInvite, error: canInviteError } = await supabase.rpc("can_invite", {
    inviter_id: user.id,
    desired_invite_type: inviteType,
  });

  if (canInviteError) {
    return Response.json(
      { success: false, error: `Erro ao validar permissão: ${canInviteError.message}` },
      { status: 500 }
    );
  }

  if (!canInvite) {
    return Response.json(
      { success: false, error: "Sem permissão para criar esse tipo de convite." },
      { status: 403 }
    );
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = PERMANENT_EXPIRES_AT;

  const targetAdminUserId = inviteType === "admin" ? null : user.id;

  const { error: insertError } = await supabase
    .from("user_invitations")
    .insert({
      invited_email: email,
      normalized_email: normalizedEmail,
      invite_type: inviteType,
      invited_by_user_id: user.id,
      target_admin_user_id: targetAdminUserId,
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
    });

  if (insertError) {
    return Response.json(
      { success: false, error: `Erro ao criar convite: ${insertError.message}` },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const inviteLink = `${origin}/convite/finalizar?token=${encodeURIComponent(rawToken)}`;
  const emailDelivery = await sendInviteEmail({
    toEmail: normalizedEmail,
    inviteLink,
    inviteType,
    expiresAt,
  });

  return Response.json(
    {
      success: true,
      invite_id: null,
      invite_link: inviteLink,
      invite_type: inviteType,
      invited_email: email,
      expires_at: expiresAt,
      email_delivery: emailDelivery,
    },
    { status: 201 }
  );
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { role, error: roleError } = await getUserRole(supabase, user.id);

  if (roleError || !role) {
    return Response.json(
      { success: false, error: `Erro ao carregar perfil: ${roleError}` },
      { status: 500 }
    );
  }

  if (role !== "admin" && role !== "dono" && role !== "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let query = supabase
    .from("user_invitations")
    .select(
      "id, invited_email, normalized_email, invite_type, status, created_at, accepted_at, accepted_by_user_id, revoked_at, expires_at, invited_by_user_id, target_admin_user_id"
    )
    .order("created_at", { ascending: false });

  if (role === "admin") {
    query = query
      .in("invite_type", ["gestor", "auxiliar"])
      .eq("invited_by_user_id", user.id)
      .eq("target_admin_user_id", user.id);
  } else if (role === "gestor") {
    query = query
      .eq("invite_type", "auxiliar")
      .eq("invited_by_user_id", user.id)
      .eq("target_admin_user_id", user.id);
  } else {
    query = query.eq("invite_type", "admin");
  }

  const { data, error } = await query;

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao listar convites: ${error.message}` },
      { status: 500 }
    );
  }

  const invites = (data || []).map((invite) => ({
    ...invite,
    can_revoke: invite.status === "pending",
  }));

  let vinculosGestoresFiltrados: Array<{
    admin_user_id: string;
    gestor_user_id: string;
    created_at: string;
  }> = [];
  let vinculosAuxiliaresFiltrados: Array<{
    owner_user_id: string;
    owner_role: string | null;
    auxiliar_user_id: string;
    created_at: string;
  }> = [];

  if (role === "admin" || role === "dono") {
    const { data: vinculosData, error: vinculosError } = await supabase
      .from("admin_gestores")
      .select("admin_user_id, gestor_user_id, created_at")
      .eq("status", "ativo");

    if (vinculosError) {
      return Response.json(
        { success: false, error: `Erro ao listar gestores ativos: ${vinculosError.message}` },
        { status: 500 }
      );
    }

    vinculosGestoresFiltrados =
      role === "admin"
        ? ((vinculosData as Array<{
            admin_user_id: string;
            gestor_user_id: string;
            created_at: string;
          }>) || []).filter((v) => v.admin_user_id === user.id)
        : ((vinculosData as Array<{
            admin_user_id: string;
            gestor_user_id: string;
            created_at: string;
          }>) || []);
  }

  if (role === "admin" || role === "gestor") {
    const { data: auxiliaresData, error: auxiliaresError } = await supabase
      .from("auxiliar_vinculos")
      .select("owner_user_id, owner_role, auxiliar_user_id, created_at")
      .eq("owner_user_id", user.id)
      .eq("status", "ativo");

    if (auxiliaresError) {
      return Response.json(
        { success: false, error: `Erro ao listar auxiliares ativos: ${auxiliaresError.message}` },
        { status: 500 }
      );
    }

    vinculosAuxiliaresFiltrados =
      (auxiliaresData as Array<{
        owner_user_id: string;
        owner_role: string | null;
        auxiliar_user_id: string;
        created_at: string;
      }>) || [];
  }

  const userIds = Array.from(
    new Set(
      [
        ...vinculosGestoresFiltrados.flatMap((vinculo) => [vinculo.gestor_user_id, vinculo.admin_user_id]),
        ...vinculosAuxiliaresFiltrados.flatMap((vinculo) => [vinculo.auxiliar_user_id, vinculo.owner_user_id]),
      ]
    )
  );

  const perfisMap: Record<string, { nome: string | null; email: string | null }> = {};
  if (userIds.length > 0) {
    const { data: perfisData, error: perfisError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", userIds);

    if (!perfisError) {
      for (const perfil of (perfisData as Array<{
        id: string;
        nome: string | null;
      }>) || []) {
        perfisMap[perfil.id] = {
          nome: perfil.nome,
          email: null,
        };
      }
    } else {
      const { data: perfisFallbackData, error: perfisFallbackError } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);

      if (perfisFallbackError) {
        return Response.json(
          {
            success: false,
            error: `Erro ao carregar perfis de gestores ativos: ${perfisFallbackError.message}`,
          },
          { status: 500 }
        );
      }

      for (const perfil of (perfisFallbackData as Array<{
        id: string;
        nome: string | null;
      }>) || []) {
        perfisMap[perfil.id] = {
          nome: perfil.nome,
          email: null,
        };
      }
    }
  }

  const acceptedByUserIdSet = new Set(
    invites
      .filter(
        (invite) =>
          (invite.status as InviteStatus) === "accepted" && !!invite.accepted_by_user_id
      )
      .map((invite) => invite.accepted_by_user_id as string)
  );

  const gestoresAtivos: GestorAtivoResumo[] = vinculosGestoresFiltrados.map((vinculo) => ({
    gestor_user_id: vinculo.gestor_user_id,
    gestor_nome: perfisMap[vinculo.gestor_user_id]?.nome ?? null,
    gestor_email: perfisMap[vinculo.gestor_user_id]?.email ?? null,
    admin_user_id: vinculo.admin_user_id,
    admin_nome: perfisMap[vinculo.admin_user_id]?.nome ?? null,
    vinculado_em: vinculo.created_at,
    tem_convite_aceito: acceptedByUserIdSet.has(vinculo.gestor_user_id),
  }));

  const auxiliaresAtivos: AuxiliarAtivoResumo[] = vinculosAuxiliaresFiltrados.map((vinculo) => ({
    auxiliar_user_id: vinculo.auxiliar_user_id,
    auxiliar_nome: perfisMap[vinculo.auxiliar_user_id]?.nome ?? null,
    auxiliar_email: perfisMap[vinculo.auxiliar_user_id]?.email ?? null,
    owner_user_id: vinculo.owner_user_id,
    owner_nome: perfisMap[vinculo.owner_user_id]?.nome ?? null,
    owner_role:
      vinculo.owner_role === "admin"
        ? "admin"
        : vinculo.owner_role === "gestor"
        ? "gestor"
        : null,
    vinculado_em: vinculo.created_at,
    tem_convite_aceito: acceptedByUserIdSet.has(vinculo.auxiliar_user_id),
  }));

  return Response.json(
    { success: true, role, invites, gestores_ativos: gestoresAtivos, auxiliares_ativos: auxiliaresAtivos },
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { role, error: roleError } = await getUserRole(supabase, user.id);

  if (roleError || !role) {
    return Response.json(
      { success: false, error: `Erro ao carregar perfil: ${roleError}` },
      { status: 500 }
    );
  }

  if (role !== "admin" && role !== "dono" && role !== "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { invite_id?: string; action?: "revoke" | "regenerate_link" };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const inviteId = (body.invite_id ?? "").trim();
  const action = body.action ?? "revoke";

  if (action !== "revoke" && action !== "regenerate_link") {
    return Response.json(
      { success: false, error: "Ação inválida. Use action='revoke' ou action='regenerate_link'." },
      { status: 400 }
    );
  }

  if (!inviteId || !isUuid(inviteId)) {
    return Response.json({ success: false, error: "invite_id inválido." }, { status: 400 });
  }

  let inviteScopeQuery = supabase
    .from("user_invitations")
    .select("id, status, invite_type, invited_by_user_id, target_admin_user_id")
    .eq("id", inviteId);

  if (role === "admin") {
    inviteScopeQuery = inviteScopeQuery
      .in("invite_type", ["gestor", "auxiliar"])
      .eq("invited_by_user_id", user.id)
      .eq("target_admin_user_id", user.id);
  } else if (role === "gestor") {
    inviteScopeQuery = inviteScopeQuery
      .eq("invite_type", "auxiliar")
      .eq("invited_by_user_id", user.id)
      .eq("target_admin_user_id", user.id);
  } else {
    inviteScopeQuery = inviteScopeQuery.eq("invite_type", "admin");
  }

  const { data: inviteData, error: inviteError } = await inviteScopeQuery.maybeSingle();

  if (inviteError) {
    return Response.json(
      { success: false, error: `Erro ao validar convite: ${inviteError.message}` },
      { status: 500 }
    );
  }

  if (!inviteData) {
    return Response.json(
      { success: false, error: "Convite não encontrado ou sem permissão." },
      { status: 404 }
    );
  }

  if ((inviteData.status as InviteStatus) !== "pending") {
    return Response.json(
      {
        success: false,
        error:
          action === "revoke"
            ? "Somente convites pendentes podem ser revogados."
            : "Somente convites pendentes podem gerar novo link.",
      },
      { status: 400 }
    );
  }

  if (action === "revoke") {
    const { error: revokeError } = await supabase
      .from("user_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("id", inviteId)
      .eq("status", "pending");

    if (revokeError) {
      return Response.json(
        { success: false, error: `Erro ao revogar convite: ${revokeError.message}` },
        { status: 500 }
      );
    }

    return Response.json(
      {
        success: true,
        invite_id: inviteId,
        status: "revoked",
      },
      { status: 200 }
    );
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = PERMANENT_EXPIRES_AT;

  const { error: regenerateError } = await supabase
    .from("user_invitations")
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .eq("id", inviteId)
    .eq("status", "pending");

  if (regenerateError) {
    return Response.json(
      { success: false, error: `Erro ao regenerar link do convite: ${regenerateError.message}` },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const inviteLink = `${origin}/convite/finalizar?token=${encodeURIComponent(rawToken)}`;

  return Response.json(
    {
      success: true,
      invite_id: inviteId,
      status: "pending",
      invite_link: inviteLink,
      expires_at: expiresAt,
    },
    { status: 200 }
  );
}
