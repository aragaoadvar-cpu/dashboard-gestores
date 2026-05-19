import type { ModulePermissionsView } from "./modules";

type SupabaseLike = {
  from: (table: string) => any;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isMissingPlatformInvitationsErrorMessage(message: string | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("platform_user_invitations");
}

export async function hasPlatformInvitationRecord(
  supabase: SupabaseLike,
  email: string
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const { count, error } = await supabase
    .from("platform_user_invitations")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .in("status", ["pending", "accepted"]);

  if (error) {
    if (isMissingPlatformInvitationsErrorMessage(error.message)) {
      return false;
    }

    throw new Error(
      `Erro ao validar aceite de convite da plataforma: ${error.message ?? "erro desconhecido"}`
    );
  }

  return (count ?? 0) > 0;
}

export async function hasAcceptedDashboardInvitationRecord(
  supabase: SupabaseLike,
  userId: string
) {
  if (!userId.trim()) {
    return false;
  }

  const { count, error } = await supabase
    .from("user_invitations")
    .select("id", { count: "exact", head: true })
    .eq("accepted_by_user_id", userId)
    .in("invite_type", ["admin", "gestor_admin", "gestor", "auxiliar"])
    .eq("status", "accepted");

  if (error) {
    throw new Error(
      `Erro ao validar convite aceito da Dashboard: ${error.message ?? "erro desconhecido"}`
    );
  }

  return (count ?? 0) > 0;
}

export function resolveDashboardAccess(params: {
  hasModuleRows: boolean;
  hasDashboardModuleRow: boolean;
  modules: ModulePermissionsView;
  hasPlatformInviteRecord: boolean;
  hasAcceptedDashboardInvitationRecord?: boolean;
  hasSharedAliadoAccess?: boolean;
}) {
  const {
    hasModuleRows,
    hasDashboardModuleRow,
    modules,
    hasPlatformInviteRecord,
    hasAcceptedDashboardInvitationRecord = false,
    hasSharedAliadoAccess = false,
  } = params;

  if (hasModuleRows) {
    return modules.dashboard_ads || (!hasDashboardModuleRow && hasAcceptedDashboardInvitationRecord);
  }

  // Usuarios do fluxo novo da plataforma devem respeitar apenas
  // user_module_permissions, sem fallback legado de Dashboard.
  if (hasPlatformInviteRecord || hasSharedAliadoAccess) {
    return false;
  }

  return true;
}
