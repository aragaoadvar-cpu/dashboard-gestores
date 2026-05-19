import "./globals.css";
import { Suspense } from "react";
import AppShell from "./AppShell";
import { createClient } from "@/lib/supabase/server";
import {
  hasAcceptedDashboardInvitationRecord,
  hasPlatformInvitationRecord,
  resolveDashboardAccess,
} from "@/lib/platform-access/dashboard-access";
import {
  hasAnyOwnAliadoScope,
  resolveModulePermissions,
  type StoredModuleKey,
} from "@/lib/platform-access/modules";
import { parseRole, type RoleUsuario } from "@/lib/platform-access/roles";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let roleUsuario: RoleUsuario = null;
  let canAccessDashboard = false;
  let canAccessAliado = false;
  let hasOwnAliadoModule = false;
  let hasOwnAliadoPessoalModule = false;
  let hasOwnAliadoEmpresarialModule = false;
  let canManagePlatformUsers = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      roleUsuario = parseRole(profileData?.role);

      canManagePlatformUsers = roleUsuario === "admin" || roleUsuario === "dono";

      const { count: sharedCount } = await supabase
        .from("financeiro_shared_access")
        .select("id", { count: "exact", head: true })
        .eq("shared_user_id", user.id)
        .eq("status", "accepted");

      const { data: permissionsData, error: permissionsError } = await supabase
        .from("user_module_permissions")
        .select("module_key, enabled")
        .eq("user_id", user.id);

      if (!permissionsError && permissionsData) {
        const hasRows = permissionsData.length > 0;
        const hasDashboardModuleRow = (
          permissionsData as Array<{ module_key: StoredModuleKey; enabled: boolean }>
        ).some((item) => item.module_key === "dashboard_ads");
        const modules = resolveModulePermissions(
          permissionsData as Array<{ module_key: StoredModuleKey; enabled: boolean }>
        );
        const hasPlatformInviteRecord = await hasPlatformInvitationRecord(
          supabase,
          user.email?.trim().toLowerCase() ?? ""
        );
        const hasAcceptedDashboardInviteRecord = await hasAcceptedDashboardInvitationRecord(
          supabase,
          user.id
        );
        canAccessDashboard = resolveDashboardAccess({
          hasModuleRows: hasRows,
          hasDashboardModuleRow,
          modules,
          hasPlatformInviteRecord,
          hasAcceptedDashboardInvitationRecord: hasAcceptedDashboardInviteRecord,
          hasSharedAliadoAccess: (sharedCount ?? 0) > 0,
        });
        hasOwnAliadoPessoalModule = modules.aliado_financeiro_pessoal;
        hasOwnAliadoEmpresarialModule = modules.aliado_financeiro_empresarial;
        hasOwnAliadoModule = hasAnyOwnAliadoScope(modules);
      }

      canAccessAliado = hasOwnAliadoModule || (sharedCount ?? 0) > 0;
    }
  } catch {
    roleUsuario = null;
  }

  return (
    <html lang="pt-br">
      <body>
        <Suspense fallback={children}>
          <AppShell
            roleUsuario={roleUsuario}
            canAccessDashboard={canAccessDashboard}
            canAccessAliado={canAccessAliado}
            hasOwnAliadoModule={hasOwnAliadoModule}
            hasOwnAliadoPessoalModule={hasOwnAliadoPessoalModule}
            hasOwnAliadoEmpresarialModule={hasOwnAliadoEmpresarialModule}
            canManagePlatformUsers={canManagePlatformUsers}
          >
            {children}
          </AppShell>
        </Suspense>
      </body>
    </html>
  );
}
