import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  hasAcceptedDashboardInvitationRecord,
  hasPlatformInvitationRecord,
  resolveDashboardAccess,
} from "./dashboard-access";
import {
  hasAnyOwnAliadoScope,
  resolveModulePermissions,
  type ModulePermissionsView,
  type StoredModuleKey,
} from "./modules";
import { parseRole, type RoleUsuario } from "./roles";

export type PlatformAccessContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  nomeAtual: string;
  roleUsuario: RoleUsuario;
  isActive: boolean;
  hasModuleRows: boolean;
  modules: ModulePermissionsView;
  hasOwnAliadoModule: boolean;
  hasOwnAliadoPessoalModule: boolean;
  hasOwnAliadoEmpresarialModule: boolean;
  hasSharedAliadoAccess: boolean;
  canAccessDashboard: boolean;
  canAccessAliado: boolean;
  canManagePlatformUsers: boolean;
};

type AccessOptions = {
  allowInactive?: boolean;
};

function isMissingRelationErrorMessage(message: string | undefined) {
  return (message ?? "").toLowerCase().includes("user_module_permissions");
}

export async function getPlatformAccessContext(
  options: AccessOptions = {}
): Promise<PlatformAccessContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("nome, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    redirect("/login");
  }

  const nomeAtual = profileData.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

  const isActive = profileData.is_active !== false;
  if (!isActive && !options.allowInactive) {
    redirect("/conta-desativada");
  }

  let permissions: Array<{ module_key: StoredModuleKey; enabled: boolean }> = [];
  let hasModuleRows = false;
  let hasDashboardModuleRow = false;

  const { data: permissionsData, error: permissionsError } = await supabase
    .from("user_module_permissions")
    .select("module_key, enabled")
    .eq("user_id", user.id);

  if (!permissionsError && permissionsData) {
    permissions = permissionsData as Array<{ module_key: StoredModuleKey; enabled: boolean }>;
    hasModuleRows = permissions.length > 0;
    hasDashboardModuleRow = permissions.some((item) => item.module_key === "dashboard_ads");
  } else if (
    permissionsError &&
    !isMissingRelationErrorMessage(permissionsError.message)
  ) {
    throw new Error(`Erro ao carregar permissões de módulos: ${permissionsError.message}`);
  }

  const modules = resolveModulePermissions(permissions);
  const hasPlatformInviteRecord = await hasPlatformInvitationRecord(
    supabase,
    user.email?.trim().toLowerCase() ?? ""
  );
  const hasAcceptedDashboardInviteRecord = await hasAcceptedDashboardInvitationRecord(
    supabase,
    user.id
  );

  let hasSharedAliadoAccess = false;
  const { count: sharedCount, error: sharedError } = await supabase
    .from("financeiro_shared_access")
    .select("id", { count: "exact", head: true })
    .eq("shared_user_id", user.id)
    .eq("status", "accepted");

  if (!sharedError) {
    hasSharedAliadoAccess = (sharedCount ?? 0) > 0;
  }

  const roleUsuario = parseRole(profileData.role);
  const canManagePlatformUsers = roleUsuario === "admin" || roleUsuario === "dono";
  const canAccessDashboard = resolveDashboardAccess({
    hasModuleRows,
    hasDashboardModuleRow,
    modules,
    hasPlatformInviteRecord,
    hasAcceptedDashboardInvitationRecord: hasAcceptedDashboardInviteRecord,
    hasSharedAliadoAccess,
  });
  const hasOwnAliadoPessoalModule = modules.aliado_financeiro_pessoal;
  const hasOwnAliadoEmpresarialModule = modules.aliado_financeiro_empresarial;
  const hasOwnAliadoModule = hasAnyOwnAliadoScope(modules);
  const canAccessAliado = hasOwnAliadoModule || hasSharedAliadoAccess;

  return {
    supabase,
    userId: user.id,
    email: user.email?.trim().toLowerCase() ?? "",
    nomeAtual,
    roleUsuario,
    isActive,
    hasModuleRows,
    modules,
    hasOwnAliadoModule,
    hasOwnAliadoPessoalModule,
    hasOwnAliadoEmpresarialModule,
    hasSharedAliadoAccess,
    canAccessDashboard,
    canAccessAliado,
    canManagePlatformUsers,
  };
}

export async function requireDashboardModuleAccess() {
  const context = await getPlatformAccessContext();

  if (!context.canAccessDashboard) {
    redirect("/inicio");
  }

  return context;
}

export async function requireAliadoModuleAccess() {
  const context = await getPlatformAccessContext();

  if (!context.canAccessAliado) {
    redirect("/inicio");
  }

  return context;
}

export async function requirePlatformManager() {
  const context = await getPlatformAccessContext();

  if (!context.canManagePlatformUsers) {
    redirect("/inicio");
  }

  return context;
}
