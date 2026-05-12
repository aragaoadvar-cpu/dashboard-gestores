import { createClient } from "@/lib/supabase/server";
import {
  hasAnyOwnAliadoScope,
  resolveModulePermissions,
  type StoredModuleKey,
} from "./modules";
import type { RoleUsuario } from "./server";

function parseRole(value: string | null | undefined): RoleUsuario {
  if (value === "dono" || value === "admin" || value === "gestor" || value === "auxiliar") {
    return value;
  }
  return null;
}

function isMissingRelationErrorMessage(message: string | undefined) {
  return (message ?? "").toLowerCase().includes("user_module_permissions");
}

export async function getApiAccessContext() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: "Usuário não autenticado." };
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role, nome, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    return { ok: false as const, status: 401, error: "Perfil do usuário não encontrado." };
  }

  const roleUsuario = parseRole(profileData.role);
  const isActive = profileData.is_active !== false;

  if (!isActive) {
    return { ok: false as const, status: 403, error: "Conta desativada." };
  }

  const canManagePlatformUsers = roleUsuario === "admin" || roleUsuario === "dono";

  const { data: permissionsData, error: permissionsError } = await supabase
    .from("user_module_permissions")
    .select("module_key, enabled")
    .eq("user_id", user.id);

  let permissions: Array<{ module_key: StoredModuleKey; enabled: boolean }> = [];
  let hasModuleRows = false;

  if (!permissionsError && permissionsData) {
    permissions = permissionsData as Array<{ module_key: StoredModuleKey; enabled: boolean }>;
    hasModuleRows = permissions.length > 0;
  } else if (
    permissionsError &&
    !isMissingRelationErrorMessage(permissionsError.message)
  ) {
    return {
      ok: false as const,
      status: 500,
      error: `Erro ao carregar permissões de módulos: ${permissionsError.message}`,
    };
  }

  const modules = resolveModulePermissions(permissions);
  const canAccessDashboard = hasModuleRows ? modules.dashboard_ads : true;
  const hasOwnAliadoPessoalModule = modules.aliado_financeiro_pessoal;
  const hasOwnAliadoEmpresarialModule = modules.aliado_financeiro_empresarial;
  const hasOwnAliadoModule = hasAnyOwnAliadoScope(modules);

  let hasSharedAliadoAccess = false;
  const { count: sharedCount, error: sharedError } = await supabase
    .from("financeiro_shared_access")
    .select("id", { count: "exact", head: true })
    .eq("shared_user_id", user.id)
    .eq("status", "accepted");

  if (!sharedError) {
    hasSharedAliadoAccess = (sharedCount ?? 0) > 0;
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    email: user.email?.trim().toLowerCase() ?? "",
    nomeAtual: profileData.nome?.trim() ?? "",
    isActive,
    roleUsuario,
    canManagePlatformUsers,
    canAccessDashboard,
    canAccessAliado: hasOwnAliadoModule || hasSharedAliadoAccess,
    hasOwnAliadoModule,
    hasOwnAliadoPessoalModule,
    hasOwnAliadoEmpresarialModule,
    hasSharedAliadoAccess,
    modules,
  };
}
