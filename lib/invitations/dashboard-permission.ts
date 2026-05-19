import { syncEffectiveProfileActiveState } from "@/lib/platform-access/profile-activity";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";

export type DashboardInviteType = "admin" | "gestor_admin" | "gestor" | "auxiliar";

export function isDashboardInviteType(value: unknown): value is DashboardInviteType {
  return (
    value === "admin" ||
    value === "gestor_admin" ||
    value === "gestor" ||
    value === "auxiliar"
  );
}

export async function ensureDashboardPermissionForUser(params: {
  userId: string;
  grantedBy?: string | null;
}) {
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const { error: dashboardError } = await serviceSupabase
    .from("user_module_permissions")
    .upsert(
      {
        user_id: params.userId,
        module_key: "dashboard_ads",
        enabled: true,
        granted_by: params.grantedBy ?? null,
      },
      {
        onConflict: "user_id,module_key",
      }
    );

  if (dashboardError) {
    throw new Error(`Erro ao liberar acesso à Dashboard: ${dashboardError.message}`);
  }

  await syncEffectiveProfileActiveState(serviceSupabase, params.userId);
}
