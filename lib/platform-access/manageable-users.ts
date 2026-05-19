import { getPlatformServiceSupabaseClient } from "./service";
import {
  isStoredModuleKey,
  resolveModulePermissions,
  type ModulePermissionsView,
  type StoredModuleKey,
  type ManageableModuleKey,
} from "./modules";

export type ModuleKey = ManageableModuleKey;
export type ManagedRole =
  | "dono"
  | "admin"
  | "gestor_admin"
  | "gestor"
  | "auxiliar"
  | null;

export type ManagedUserRow = {
  user_id: string;
  nome: string | null;
  email: string | null;
  role: ManagedRole;
  is_active: boolean;
  modules: ModulePermissionsView;
  has_aliado_module_history: boolean;
};

function parseRole(value: string | null | undefined): ManagedRole {
  if (
    value === "dono" ||
    value === "admin" ||
    value === "gestor_admin" ||
    value === "gestor" ||
    value === "auxiliar"
  ) {
    return value;
  }
  return null;
}

async function getProfilesWithEmailSafe(ids: string[]) {
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  if (ids.length === 0) {
    return [] as Array<{
      id: string;
      nome: string | null;
      role: string | null;
      email: string | null;
      is_active: boolean | null;
    }>;
  }

  const withEmail = await serviceSupabase
    .from("profiles")
    .select("id, nome, role, email, is_active")
    .in("id", ids);

  if (!withEmail.error) {
    return (withEmail.data ?? []) as Array<{
      id: string;
      nome: string | null;
      role: string | null;
      email: string | null;
      is_active: boolean | null;
    }>;
  }

  const fallback = await serviceSupabase
    .from("profiles")
    .select("id, nome, role, is_active")
    .in("id", ids);

  if (fallback.error) {
    throw new Error(`Erro ao carregar perfis: ${fallback.error.message}`);
  }

  return (fallback.data ?? []).map((item) => ({
    ...item,
    email: null,
  })) as Array<{
    id: string;
    nome: string | null;
    role: string | null;
    email: string | null;
    is_active: boolean | null;
  }>;
}

export async function listManageableUsers({
  viewerUserId,
  viewerRole,
}: {
  viewerUserId: string;
  viewerRole: ManagedRole;
}) {
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const manageableUserIds = new Set<string>();
  if (viewerRole === "dono") {
    const { data: allProfiles, error: allProfilesError } = await serviceSupabase
      .from("profiles")
      .select("id");

    if (allProfilesError) {
      throw new Error(`Erro ao listar usuários: ${allProfilesError.message}`);
    }

    for (const item of allProfiles ?? []) {
      manageableUserIds.add(item.id);
    }
  } else if (viewerRole === "admin") {
    const { data: gestoresData, error: gestoresError } = await serviceSupabase
      .from("admin_gestores")
      .select("gestor_user_id")
      .eq("admin_user_id", viewerUserId)
      .eq("status", "ativo");

    if (gestoresError) {
      throw new Error(`Erro ao listar gestores do admin: ${gestoresError.message}`);
    }

    const gestorIds = (gestoresData ?? []).map((item) => item.gestor_user_id);
    for (const gestorId of gestorIds) manageableUserIds.add(gestorId);

    const ownerIds = [viewerUserId, ...gestorIds];
    const { data: auxiliaresData, error: auxiliaresError } = await serviceSupabase
      .from("auxiliar_vinculos")
      .select("auxiliar_user_id")
      .in("owner_user_id", ownerIds)
      .eq("status", "ativo");

    if (auxiliaresError) {
      throw new Error(`Erro ao listar auxiliares do admin: ${auxiliaresError.message}`);
    }

    for (const item of auxiliaresData ?? []) {
      manageableUserIds.add(item.auxiliar_user_id);
    }

    const { data: grantedModulesData, error: grantedModulesError } = await serviceSupabase
      .from("user_module_permissions")
      .select("user_id")
      .eq("granted_by", viewerUserId)
      .eq("enabled", true);

    if (grantedModulesError) {
      throw new Error(
        `Erro ao listar usuarios com modulos concedidos pelo admin: ${grantedModulesError.message}`
      );
    }

    for (const item of grantedModulesData ?? []) {
      manageableUserIds.add(item.user_id);
    }

    const { data: acceptedDashboardGestorAdmins, error: acceptedDashboardGestorAdminsError } =
      await serviceSupabase
        .from("user_invitations")
        .select("accepted_by_user_id")
        .eq("invited_by_user_id", viewerUserId)
        .eq("invite_type", "gestor_admin")
        .eq("status", "accepted")
        .not("accepted_by_user_id", "is", null);

    if (acceptedDashboardGestorAdminsError) {
      throw new Error(
        `Erro ao listar gestores admin convidados pela Dashboard: ${acceptedDashboardGestorAdminsError.message}`
      );
    }

    for (const invite of acceptedDashboardGestorAdmins ?? []) {
      if (invite.accepted_by_user_id) {
        manageableUserIds.add(invite.accepted_by_user_id);
      }
    }

    const { data: platformInvites, error: platformInvitesError } = await serviceSupabase
      .from("platform_user_invitations")
      .select("accepted_by_user_id")
      .eq("invited_by", viewerUserId)
      .eq("status", "accepted");

    if (platformInvitesError) {
      throw new Error(`Erro ao listar convites da plataforma: ${platformInvitesError.message}`);
    }

    for (const invite of platformInvites ?? []) {
      if (invite.accepted_by_user_id) {
        manageableUserIds.add(invite.accepted_by_user_id);
      }
    }

    const { data: financeShares, error: financeSharesError } = await serviceSupabase
      .from("financeiro_shared_access")
      .select("shared_user_id")
      .in("owner_user_id", ownerIds)
      .eq("status", "accepted");

    if (financeSharesError) {
      throw new Error(`Erro ao listar compartilhamentos financeiros: ${financeSharesError.message}`);
    }

    for (const share of financeShares ?? []) {
      if (share.shared_user_id) {
        manageableUserIds.add(share.shared_user_id);
      }
    }
  } else {
    return [];
  }

  const profiles = await getProfilesWithEmailSafe(Array.from(manageableUserIds));
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  const finalUserIds = Array.from(manageableUserIds);

  const { data: permissionsData, error: permissionsError } = await serviceSupabase
    .from("user_module_permissions")
    .select("user_id, module_key, enabled")
    .in("user_id", finalUserIds);

  if (permissionsError) {
    throw new Error(`Erro ao carregar permissões dos módulos: ${permissionsError.message}`);
  }

  const permissionsByUser = new Map<string, ModulePermissionsView>();
  const dashboardEnabledUserIds = new Set<string>();
  const dashboardPermissionUserIds = new Set<string>();
  const aliadoModuleHistoryUserIds = new Set<string>();

  for (const userId of finalUserIds) {
    permissionsByUser.set(userId, {
      dashboard_ads: false,
      aliado_financeiro_pessoal: false,
      aliado_financeiro_empresarial: false,
    });
  }

  const groupedPermissions = new Map<
    string,
    Array<{ module_key: StoredModuleKey; enabled: boolean }>
  >();

  for (const item of permissionsData ?? []) {
    if (!isStoredModuleKey(item.module_key)) continue;

    if (item.module_key === "dashboard_ads" && Boolean(item.enabled)) {
      dashboardEnabledUserIds.add(item.user_id);
    }

    if (item.module_key === "dashboard_ads") {
      dashboardPermissionUserIds.add(item.user_id);
    }

    if (
      item.module_key === "aliado_financeiro" ||
      item.module_key === "aliado_financeiro_pessoal" ||
      item.module_key === "aliado_financeiro_empresarial"
    ) {
      aliadoModuleHistoryUserIds.add(item.user_id);
    }

    const current = groupedPermissions.get(item.user_id) ?? [];
    current.push({
      module_key: item.module_key,
      enabled: Boolean(item.enabled),
    });
    groupedPermissions.set(item.user_id, current);
  }

  for (const [userId, items] of groupedPermissions) {
    permissionsByUser.set(userId, resolveModulePermissions(items));
  }

  const acceptedDashboardInviteUserIds = new Set<string>();
  if (finalUserIds.length > 0) {
    const { data: dashboardInvitesData, error: dashboardInvitesError } = await serviceSupabase
      .from("user_invitations")
      .select("accepted_by_user_id")
      .in("accepted_by_user_id", finalUserIds)
      .in("invite_type", ["admin", "gestor_admin", "gestor", "auxiliar"])
      .eq("status", "accepted")
      .not("accepted_by_user_id", "is", null);

    if (dashboardInvitesError) {
      throw new Error(
        `Erro ao carregar convites aceitos da Dashboard: ${dashboardInvitesError.message}`
      );
    }

    for (const invite of dashboardInvitesData ?? []) {
      if (invite.accepted_by_user_id) {
        acceptedDashboardInviteUserIds.add(invite.accepted_by_user_id);
      }
    }
  }

  return finalUserIds
    .map((userId) => {
      const profile = profilesById.get(userId);
      if (!profile) return null;

      return {
        user_id: userId,
        nome: profile.nome ?? null,
        email: profile.email ?? null,
        role: parseRole(profile.role),
        is_active: profile.is_active !== false,
        modules: {
          ...(permissionsByUser.get(userId) ?? {
            dashboard_ads: false,
            aliado_financeiro_pessoal: false,
            aliado_financeiro_empresarial: false,
          }),
          dashboard_ads:
            (permissionsByUser.get(userId)?.dashboard_ads ?? false) ||
            dashboardEnabledUserIds.has(userId) ||
            (!dashboardPermissionUserIds.has(userId) &&
              acceptedDashboardInviteUserIds.has(userId)),
        },
        has_aliado_module_history: aliadoModuleHistoryUserIds.has(userId),
      };
    })
    .filter((item): item is ManagedUserRow => Boolean(item))
    .sort((a, b) => {
      const nomeA = (a.nome ?? a.email ?? "").toLowerCase();
      const nomeB = (b.nome ?? b.email ?? "").toLowerCase();
      return nomeA.localeCompare(nomeB, "pt-BR");
    });
}

export async function findManageableUser({
  viewerUserId,
  viewerRole,
  targetUserId,
}: {
  viewerUserId: string;
  viewerRole: ManagedRole;
  targetUserId: string;
}) {
  const users = await listManageableUsers({ viewerUserId, viewerRole });
  return users.find((item) => item.user_id === targetUserId) ?? null;
}
