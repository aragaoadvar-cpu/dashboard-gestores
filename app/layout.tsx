import "./globals.css";
import { Suspense } from "react";
import AppShell from "./AppShell";
import { createClient } from "@/lib/supabase/server";
import {
  hasAnyOwnAliadoScope,
  resolveModulePermissions,
  type StoredModuleKey,
} from "@/lib/platform-access/modules";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let roleUsuario: "dono" | "admin" | "gestor" | "auxiliar" | null = null;
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

      roleUsuario =
        profileData?.role === "dono"
          ? "dono"
          : profileData?.role === "admin"
          ? "admin"
          : profileData?.role === "auxiliar"
          ? "auxiliar"
          : profileData?.role === "gestor"
          ? "gestor"
          : null;

      canManagePlatformUsers = roleUsuario === "admin" || roleUsuario === "dono";

      const { data: permissionsData, error: permissionsError } = await supabase
        .from("user_module_permissions")
        .select("module_key, enabled")
        .eq("user_id", user.id);

      if (!permissionsError && permissionsData) {
        const hasRows = permissionsData.length > 0;
        const modules = resolveModulePermissions(
          permissionsData as Array<{ module_key: StoredModuleKey; enabled: boolean }>
        );
        canAccessDashboard = hasRows ? modules.dashboard_ads : true;
        hasOwnAliadoPessoalModule = modules.aliado_financeiro_pessoal;
        hasOwnAliadoEmpresarialModule = modules.aliado_financeiro_empresarial;
        hasOwnAliadoModule = hasAnyOwnAliadoScope(modules);
      } else {
        canAccessDashboard = true;
      }

      const { count: sharedCount } = await supabase
        .from("financeiro_shared_access")
        .select("id", { count: "exact", head: true })
        .eq("shared_user_id", user.id)
        .eq("status", "accepted");

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
