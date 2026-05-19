import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceSupabase = SupabaseClient;

const PLATFORM_MODULE_KEYS = [
  "aliado_financeiro",
  "aliado_financeiro_pessoal",
  "aliado_financeiro_empresarial",
] as const;

export function getPlatformModuleKeys() {
  return [...PLATFORM_MODULE_KEYS];
}

export async function resolveEffectiveProfileActiveState(
  serviceSupabase: ServiceSupabase,
  userId: string
) {
  const [
    modulePermissionsResp,
    dashboardPermissionResp,
    acceptedDashboardInviteResp,
    gestorLinkResp,
    auxiliarLinkResp,
    financeiroShareResp,
  ] = await Promise.all([
    serviceSupabase
      .from("user_module_permissions")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("enabled", true),
    serviceSupabase
      .from("user_module_permissions")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("module_key", "dashboard_ads"),
    serviceSupabase
      .from("user_invitations")
      .select("id", { count: "exact", head: true })
      .eq("accepted_by_user_id", userId)
      .in("invite_type", ["admin", "gestor_admin", "gestor", "auxiliar"])
      .eq("status", "accepted"),
    serviceSupabase
      .from("admin_gestores")
      .select("gestor_user_id", { count: "exact", head: true })
      .eq("gestor_user_id", userId)
      .eq("status", "ativo"),
    serviceSupabase
      .from("auxiliar_vinculos")
      .select("auxiliar_user_id", { count: "exact", head: true })
      .eq("auxiliar_user_id", userId)
      .eq("status", "ativo"),
    serviceSupabase
      .from("financeiro_shared_access")
      .select("shared_user_id", { count: "exact", head: true })
      .eq("shared_user_id", userId)
      .eq("status", "accepted"),
  ]);

  if (modulePermissionsResp.error) {
    throw new Error(
      `Erro ao validar permissões de módulos do usuário: ${modulePermissionsResp.error.message}`
    );
  }

  if (gestorLinkResp.error) {
    throw new Error(`Erro ao validar vínculo de gestor: ${gestorLinkResp.error.message}`);
  }

  if (dashboardPermissionResp.error) {
    throw new Error(
      `Erro ao validar registro de acesso da Dashboard: ${dashboardPermissionResp.error.message}`
    );
  }

  if (acceptedDashboardInviteResp.error) {
    throw new Error(
      `Erro ao validar convite aceito da Dashboard: ${acceptedDashboardInviteResp.error.message}`
    );
  }

  if (auxiliarLinkResp.error) {
    throw new Error(`Erro ao validar vínculo de auxiliar: ${auxiliarLinkResp.error.message}`);
  }

  if (financeiroShareResp.error) {
    throw new Error(
      `Erro ao validar compartilhamentos financeiros ativos: ${financeiroShareResp.error.message}`
    );
  }

  return (
    (modulePermissionsResp.count ?? 0) > 0 ||
    ((dashboardPermissionResp.count ?? 0) === 0 && (acceptedDashboardInviteResp.count ?? 0) > 0) ||
    (gestorLinkResp.count ?? 0) > 0 ||
    (auxiliarLinkResp.count ?? 0) > 0 ||
    (financeiroShareResp.count ?? 0) > 0
  );
}

export async function syncEffectiveProfileActiveState(
  serviceSupabase: ServiceSupabase,
  userId: string
) {
  const isActive = await resolveEffectiveProfileActiveState(serviceSupabase, userId);

  const { error } = await serviceSupabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    throw new Error(`Erro ao sincronizar status do perfil: ${error.message}`);
  }

  return isActive;
}
