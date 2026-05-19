import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/invitations/email";
import { generateInviteToken, hashInviteToken } from "@/lib/invitations/token";
import { syncEffectiveProfileActiveState } from "@/lib/platform-access/profile-activity";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";
import { isOperationalAdminRole, parseRole, type RoleUsuario } from "@/lib/platform-access/roles";

type InviteType = "admin" | "gestor_admin" | "gestor" | "auxiliar";
type InviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired"
  | "active_linked"
  | "inactive_linked";
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
type GestorAdminStatusResumo = {
  user_id: string;
  dashboard_enabled: boolean;
};

function isInviteType(value: unknown): value is InviteType {
  return value === "admin" || value === "gestor_admin" || value === "gestor" || value === "auxiliar";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function canCreateInvitation(role: RoleUsuario, inviteType: InviteType) {
  if (inviteType === "admin") return role === "dono";
  if (inviteType === "gestor_admin") return role === "admin";
  if (inviteType === "gestor") return isOperationalAdminRole(role);
  return isOperationalAdminRole(role) || role === "gestor";
}

async function findExistingAuthUserByEmail(normalizedEmail: string) {
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await serviceSupabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Erro ao buscar usuário existente: ${error.message}`);
    }

    const users = data.users ?? [];
    const found = users.find(
      (authUser) => authUser.email?.trim().toLowerCase() === normalizedEmail
    );

    if (found) {
      return found;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function linkExistingDashboardUser(params: {
  inviterUserId: string;
  inviteType: InviteType;
  invitedEmail: string;
  normalizedEmail: string;
  targetAdminUserId: string | null;
  existingUserId: string;
}) {
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const {
    inviterUserId,
    inviteType,
    invitedEmail,
    normalizedEmail,
    targetAdminUserId,
    existingUserId,
  } = params;

  const { data: profileData, error: profileError } = await serviceSupabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", existingUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Erro ao carregar perfil do usuário existente: ${profileError.message}`);
  }

  const currentRole = parseRole(profileData?.role);
  let finalRole: RoleUsuario = currentRole ?? "gestor";

  if (inviteType === "admin") {
    if (currentRole === "dono") {
      return {
        success: false as const,
        status: 400,
        error: "Usuário já possui papel superior ao convite.",
      };
    }

    finalRole = "admin";
  } else if (inviteType === "gestor_admin") {
    if (currentRole === "dono" || currentRole === "admin") {
      return {
        success: false as const,
        status: 400,
        error:
          "Não é permitido rebaixar automaticamente usuário dono/admin para gestor_admin.",
      };
    }

    if (currentRole === "gestor") {
      const { data: activeGestorLink, error: activeGestorLinkError } = await serviceSupabase
        .from("admin_gestores")
        .select("id")
        .eq("gestor_user_id", existingUserId)
        .eq("status", "ativo")
        .maybeSingle();

      if (activeGestorLinkError) {
        throw new Error(
          `Erro ao validar vínculo ativo de gestor: ${activeGestorLinkError.message}`
        );
      }

      if (activeGestorLink) {
        return {
          success: false as const,
          status: 400,
          error:
            "Não é permitido promover automaticamente gestor com vínculo ativo para gestor_admin.",
        };
      }
    }

    if (currentRole === "auxiliar") {
      const { data: activeAuxiliarLink, error: activeAuxiliarLinkError } = await serviceSupabase
        .from("auxiliar_vinculos")
        .select("id")
        .eq("auxiliar_user_id", existingUserId)
        .eq("status", "ativo")
        .maybeSingle();

      if (activeAuxiliarLinkError) {
        throw new Error(
          `Erro ao validar vínculo ativo de auxiliar: ${activeAuxiliarLinkError.message}`
        );
      }

      if (activeAuxiliarLink) {
        return {
          success: false as const,
          status: 400,
          error:
            "Não é permitido promover automaticamente auxiliar com vínculo ativo para gestor_admin.",
        };
      }
    }

    finalRole = "gestor_admin";
  } else if (inviteType === "gestor") {
    if (currentRole === "dono" || currentRole === "admin" || currentRole === "gestor_admin") {
      return {
        success: false as const,
        status: 400,
        error:
          "Não é permitido rebaixar automaticamente usuário dono/admin para gestor.",
      };
    }

    if (!targetAdminUserId) {
      return {
        success: false as const,
        status: 400,
        error: "Convite de gestor sem admin de destino.",
      };
    }

    finalRole = "gestor";
  } else {
    if (currentRole === "dono" || currentRole === "admin" || currentRole === "gestor_admin") {
      return {
        success: false as const,
        status: 400,
        error:
          "Não é permitido rebaixar automaticamente usuário dono/admin para auxiliar.",
      };
    }

    if (currentRole === "gestor") {
      const { data: activeGestorLink, error: activeGestorLinkError } = await serviceSupabase
        .from("admin_gestores")
        .select("id")
        .eq("gestor_user_id", existingUserId)
        .eq("status", "ativo")
        .maybeSingle();

      if (activeGestorLinkError) {
        throw new Error(
          `Erro ao validar vínculo ativo de gestor: ${activeGestorLinkError.message}`
        );
      }

      if (activeGestorLink) {
        return {
          success: false as const,
          status: 400,
          error:
            "Não é permitido rebaixar automaticamente gestor com vínculo ativo para auxiliar.",
        };
      }
    }

    if (!targetAdminUserId) {
      return {
        success: false as const,
        status: 400,
        error: "Convite de auxiliar sem usuário de escopo.",
      };
    }

    finalRole = "auxiliar";
  }

  const { error: upsertProfileError } = await serviceSupabase.from("profiles").upsert(
    {
      id: existingUserId,
      role: finalRole,
      is_active: true,
    },
    {
      onConflict: "id",
    }
  );

  if (upsertProfileError) {
    throw new Error(`Erro ao atualizar perfil do usuário existente: ${upsertProfileError.message}`);
  }

  if (inviteType === "gestor") {
    const { error: gestorLinkError } = await serviceSupabase.from("admin_gestores").upsert(
      {
        id: crypto.randomUUID(),
        admin_user_id: targetAdminUserId,
        gestor_user_id: existingUserId,
        status: "ativo",
      },
      {
        onConflict: "gestor_user_id",
      }
    );

    if (gestorLinkError) {
      throw new Error(`Erro ao vincular gestor existente: ${gestorLinkError.message}`);
    }
  }

  if (inviteType === "auxiliar") {
    const { data: ownerProfile, error: ownerProfileError } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("id", targetAdminUserId)
      .maybeSingle();

    if (ownerProfileError) {
      throw new Error(`Erro ao validar owner do auxiliar: ${ownerProfileError.message}`);
    }

    const ownerRole =
      ownerProfile?.role === "admin" || ownerProfile?.role === "gestor_admin"
        ? "admin"
        : ownerProfile?.role === "gestor"
        ? "gestor"
        : null;

    if (!ownerRole) {
      return {
        success: false as const,
        status: 400,
        error:
          "Convite de auxiliar aponta para um usuário sem papel válido (admin/gestor).",
      };
    }

    const { error: auxiliarLinkError } = await serviceSupabase
      .from("auxiliar_vinculos")
      .upsert(
        {
          id: crypto.randomUUID(),
          auxiliar_user_id: existingUserId,
          owner_user_id: targetAdminUserId,
          owner_role: ownerRole,
          invited_by_user_id: inviterUserId,
          status: "ativo",
        },
        {
          onConflict: "auxiliar_user_id",
        }
      );

    if (auxiliarLinkError) {
      throw new Error(`Erro ao vincular auxiliar existente: ${auxiliarLinkError.message}`);
    }
  }

  const { error: permissionError } = await serviceSupabase
    .from("user_module_permissions")
    .upsert(
      {
        user_id: existingUserId,
        module_key: "dashboard_ads",
        enabled: true,
        granted_by: inviterUserId,
      },
      {
        onConflict: "user_id,module_key",
      }
    );

  if (permissionError) {
    throw new Error(`Erro ao liberar Dashboard para usuário existente: ${permissionError.message}`);
  }

  await syncEffectiveProfileActiveState(serviceSupabase, existingUserId);

  const tokenHash = hashInviteToken(generateInviteToken());
  const historyPayload = {
    invited_email: invitedEmail,
    normalized_email: normalizedEmail,
    invite_type: inviteType,
    invited_by_user_id: inviterUserId,
    target_admin_user_id: targetAdminUserId,
    token_hash: tokenHash,
    status: "accepted",
    expires_at: PERMANENT_EXPIRES_AT,
    accepted_by_user_id: existingUserId,
    accepted_at: new Date().toISOString(),
  };

  const { error: historyError } = await serviceSupabase
    .from("user_invitations")
    .insert(historyPayload);

  if (historyError) {
    throw new Error(`Erro ao registrar histórico do vínculo: ${historyError.message}`);
  }

  return {
    success: true as const,
    message: "Usuário já existente vinculado à Dashboard com sucesso.",
  };
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

  const role = parseRole(profileData.role);

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
      { success: false, error: "invite_type deve ser 'admin', 'gestor_admin', 'gestor' ou 'auxiliar'." },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const { role, error: roleError } = await getUserRole(supabase, user.id);

  if (roleError || !role) {
    return Response.json(
      { success: false, error: `Erro ao carregar perfil: ${roleError}` },
      { status: 500 }
    );
  }

  const canInvite = canCreateInvitation(role, inviteType);

  if (!canInvite) {
    return Response.json(
      { success: false, error: "Sem permissão para criar esse tipo de convite." },
      { status: 403 }
    );
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = PERMANENT_EXPIRES_AT;

  const targetAdminUserId =
    inviteType === "admin" || inviteType === "gestor_admin" ? null : user.id;

  const existingAuthUser = await findExistingAuthUserByEmail(normalizedEmail);

  if (existingAuthUser) {
    const linkedResult = await linkExistingDashboardUser({
      inviterUserId: user.id,
      inviteType,
      invitedEmail: email,
      normalizedEmail,
      targetAdminUserId,
      existingUserId: existingAuthUser.id,
    });

    if (!linkedResult.success) {
      return Response.json(
        { success: false, error: linkedResult.error },
        { status: linkedResult.status }
      );
    }

    return Response.json(
      {
        success: true,
        invite_id: null,
        invite_link: null,
        invite_type: inviteType,
        invited_email: email,
        expires_at: null,
        linked_existing_user: true,
        email_delivery: { status: "not_needed", message: linkedResult.message },
        message: linkedResult.message,
      },
      { status: 201 }
    );
  }

  const inviteWriter = role === "gestor_admin" ? getPlatformServiceSupabaseClient() : supabase;
  if (!inviteWriter) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  const { error: insertError } = await inviteWriter
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

  const { data: actorProfileData, error: actorProfileError } = await supabase
    .from("profiles")
    .select("nome")
    .eq("id", user.id)
    .maybeSingle();

  if (actorProfileError) {
    return Response.json(
      { success: false, error: `Erro ao carregar nome do usuário: ${actorProfileError.message}` },
      { status: 500 }
    );
  }

  const { role, error: roleError } = await getUserRole(supabase, user.id);

  if (roleError || !role) {
    return Response.json(
      { success: false, error: `Erro ao carregar perfil: ${roleError}` },
      { status: 500 }
    );
  }

  if (!isOperationalAdminRole(role) && role !== "dono" && role !== "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const inviteReader = role === "gestor_admin" ? getPlatformServiceSupabaseClient() : supabase;
  if (!inviteReader) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let query = inviteReader
    .from("user_invitations")
    .select(
      "id, invited_email, normalized_email, invite_type, status, created_at, accepted_at, accepted_by_user_id, revoked_at, expires_at, invited_by_user_id, target_admin_user_id"
    )
    .order("created_at", { ascending: false });

  if (role === "admin") {
    query = query.or(
      `and(invite_type.eq.gestor_admin,invited_by_user_id.eq.${user.id},target_admin_user_id.is.null),and(invite_type.in.(gestor,auxiliar),invited_by_user_id.eq.${user.id},target_admin_user_id.eq.${user.id})`
    );
  } else if (role === "gestor_admin") {
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

  const rawInvites = (data || []).map((invite) => ({
    ...invite,
    can_revoke: invite.status === "pending",
  }));

  let vinculosGestoresFiltrados: Array<{
    admin_user_id: string;
    gestor_user_id: string;
    status: string;
    created_at: string;
  }> = [];
  let vinculosAuxiliaresFiltrados: Array<{
    owner_user_id: string;
    owner_role: string | null;
    auxiliar_user_id: string;
    status: string;
    created_at: string;
  }> = [];
  let gestoresAdminStatus: GestorAdminStatusResumo[] = [];

  if (isOperationalAdminRole(role) || role === "dono") {
    const { data: vinculosData, error: vinculosError } = await supabase
      .from("admin_gestores")
      .select("admin_user_id, gestor_user_id, status, created_at");

    if (vinculosError) {
      return Response.json(
        { success: false, error: `Erro ao listar gestores ativos: ${vinculosError.message}` },
        { status: 500 }
      );
    }

    vinculosGestoresFiltrados =
      isOperationalAdminRole(role)
        ? ((vinculosData as Array<{
            admin_user_id: string;
            gestor_user_id: string;
            status: string;
            created_at: string;
          }>) || []).filter((v) => v.admin_user_id === user.id)
        : ((vinculosData as Array<{
            admin_user_id: string;
            gestor_user_id: string;
            status: string;
            created_at: string;
          }>) || []);
  }

  if (isOperationalAdminRole(role) || role === "gestor") {
    const { data: auxiliaresData, error: auxiliaresError } = await supabase
      .from("auxiliar_vinculos")
      .select("auxiliar_user_id, owner_user_id, owner_role, status, created_at")
      .eq("owner_user_id", user.id);

    if (auxiliaresError) {
      return Response.json(
        { success: false, error: `Erro ao listar auxiliares ativos: ${auxiliaresError.message}` },
        { status: 500 }
      );
    }

    vinculosAuxiliaresFiltrados =
      (auxiliaresData as Array<{
        auxiliar_user_id: string;
        owner_user_id: string;
        owner_role: string | null;
        status: string;
        created_at: string;
      }>) || [];
  }

  if (role === "admin") {
    const gestorAdminIds = Array.from(
      new Set(
        rawInvites
          .filter(
            (invite) =>
              invite.invite_type === "gestor_admin" &&
              invite.invited_by_user_id === user.id &&
              !!invite.accepted_by_user_id
          )
          .map((invite) => invite.accepted_by_user_id as string)
      )
    );

    if (gestorAdminIds.length > 0) {
      const dashboardStatusReader = getPlatformServiceSupabaseClient() ?? supabase;
      const { data: dashboardPermissionsData, error: dashboardPermissionsError } =
        await dashboardStatusReader
        .from("user_module_permissions")
        .select("user_id, enabled")
        .eq("module_key", "dashboard_ads")
        .in("user_id", gestorAdminIds);

      if (dashboardPermissionsError) {
        return Response.json(
          {
            success: false,
            error: `Erro ao listar status da Dashboard para gestores admin: ${dashboardPermissionsError.message}`,
          },
          { status: 500 }
        );
      }

      gestoresAdminStatus =
        (dashboardPermissionsData as Array<{ user_id: string; enabled: boolean | null }>)?.map(
          (item) => ({
            user_id: item.user_id,
            dashboard_enabled: item.enabled === true,
          })
        ) ?? [];
    }
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
    rawInvites
      .filter(
        (invite) =>
          ((invite.status as InviteStatus) === "accepted" ||
            (invite.status as InviteStatus) === "active_linked") &&
          !!invite.accepted_by_user_id
      )
      .map((invite) => invite.accepted_by_user_id as string)
  );

  const gestoresAtivos: GestorAtivoResumo[] = vinculosGestoresFiltrados
    .filter((vinculo) => vinculo.status === "ativo")
    .map((vinculo) => ({
      gestor_user_id: vinculo.gestor_user_id,
      gestor_nome: perfisMap[vinculo.gestor_user_id]?.nome ?? null,
      gestor_email: perfisMap[vinculo.gestor_user_id]?.email ?? null,
      admin_user_id: vinculo.admin_user_id,
      admin_nome: perfisMap[vinculo.admin_user_id]?.nome ?? null,
      vinculado_em: vinculo.created_at,
      tem_convite_aceito: acceptedByUserIdSet.has(vinculo.gestor_user_id),
    }));

  const auxiliarIds = Array.from(
    new Set(vinculosAuxiliaresFiltrados.map((vinculo) => vinculo.auxiliar_user_id))
  );

  const perfisAuxiliaresMap: Record<string, { nome: string | null; email: string | null }> = {};
  if (auxiliarIds.length > 0) {
    const { data: perfisAuxiliaresData, error: perfisAuxiliaresError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", auxiliarIds);

    if (!perfisAuxiliaresError) {
      for (const perfil of (perfisAuxiliaresData as Array<{ id: string; nome: string | null }>) || []) {
        perfisAuxiliaresMap[perfil.id] = {
          nome: perfil.nome,
          email: null,
        };
      }
    }
  }

  const auxiliaresAtivos: AuxiliarAtivoResumo[] = vinculosAuxiliaresFiltrados
    .filter((vinculo) => vinculo.status === "ativo")
    .map((vinculo) => ({
      auxiliar_user_id: vinculo.auxiliar_user_id,
      auxiliar_nome: perfisAuxiliaresMap[vinculo.auxiliar_user_id]?.nome ?? null,
      auxiliar_email: perfisAuxiliaresMap[vinculo.auxiliar_user_id]?.email ?? null,
      owner_user_id: vinculo.owner_user_id,
      owner_nome: actorProfileData?.nome ?? null,
      owner_role:
        vinculo.owner_role === "admin"
          ? "admin"
          : vinculo.owner_role === "gestor"
          ? "gestor"
          : null,
      vinculado_em: vinculo.created_at,
      tem_convite_aceito: true,
    }));

  const auxiliaresAtivosSet = new Set(auxiliaresAtivos.map((item) => item.auxiliar_user_id));
  const gestoresAtivosSet = new Set(gestoresAtivos.map((item) => item.gestor_user_id));
  const gestoresAdminDashboardEnabledSet = new Set(
    gestoresAdminStatus.filter((item) => item.dashboard_enabled).map((item) => item.user_id)
  );
  const gestoresAdminDashboardKnownSet = new Set(gestoresAdminStatus.map((item) => item.user_id));
  const auxiliaresInativosSet = new Set(
    vinculosAuxiliaresFiltrados
      .filter((item) => item.status === "inativo")
      .map((item) => item.auxiliar_user_id)
  );
  const gestoresInativosSet = new Set(
    vinculosGestoresFiltrados
      .filter((item) => item.status === "inativo")
      .map((item) => item.gestor_user_id)
  );

  const invites = rawInvites.map((invite) => {
    if (invite.invite_type === "auxiliar") {
      const auxiliarId = invite.accepted_by_user_id ?? null;
      const auxiliarAtivo = !!auxiliarId && auxiliaresAtivosSet.has(auxiliarId);
      const auxiliarInativo = !!auxiliarId && auxiliaresInativosSet.has(auxiliarId);

      return {
        ...invite,
        status:
          invite.status === "accepted"
            ? auxiliarAtivo
              ? "active_linked"
              : auxiliarInativo
              ? "inactive_linked"
              : invite.status
            : invite.status,
        auxiliar_user_id: auxiliarId,
        can_revoke: invite.status === "pending",
      };
    }

    if (invite.invite_type === "gestor") {
      const gestorId = invite.accepted_by_user_id ?? null;
      const gestorAtivo = !!gestorId && gestoresAtivosSet.has(gestorId);
      const gestorInativo = !!gestorId && gestoresInativosSet.has(gestorId);

      return {
        ...invite,
        status:
          invite.status === "accepted"
            ? gestorAtivo
              ? "active_linked"
              : gestorInativo
              ? "inactive_linked"
              : invite.status
            : invite.status,
        gestor_user_id: gestorId,
        can_revoke: invite.status === "pending",
      };
    }

    if (invite.invite_type === "gestor_admin") {
      const gestorAdminId = invite.accepted_by_user_id ?? null;
      const gestorAdminAtivo =
        !!gestorAdminId && gestoresAdminDashboardEnabledSet.has(gestorAdminId);
      const gestorAdminInativo =
        !!gestorAdminId &&
        gestoresAdminDashboardKnownSet.has(gestorAdminId) &&
        !gestoresAdminDashboardEnabledSet.has(gestorAdminId);

      return {
        ...invite,
        status:
          invite.status === "accepted"
            ? gestorAdminAtivo
              ? "active_linked"
              : gestorAdminInativo
              ? "inactive_linked"
              : invite.status
            : invite.status,
        can_revoke: invite.status === "pending",
      };
    }

    return invite;
  });

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

  if (!isOperationalAdminRole(role) && role !== "dono" && role !== "gestor") {
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

  const inviteWriter = role === "gestor_admin" ? getPlatformServiceSupabaseClient() : supabase;
  if (!inviteWriter) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let inviteScopeQuery = inviteWriter
    .from("user_invitations")
    .select("id, status, invite_type, invited_by_user_id, target_admin_user_id")
    .eq("id", inviteId);

  if (role === "admin") {
    inviteScopeQuery = inviteScopeQuery.or(
      `and(invite_type.eq.gestor_admin,invited_by_user_id.eq.${user.id},target_admin_user_id.is.null),and(invite_type.in.(gestor,auxiliar),invited_by_user_id.eq.${user.id},target_admin_user_id.eq.${user.id})`
    );
  } else if (role === "gestor_admin") {
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
    const { error: revokeError } = await inviteWriter
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

  const { error: regenerateError } = await inviteWriter
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
