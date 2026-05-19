import ConvitesPageClient from "./ConvitesPageClient";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";
import { isOperationalAdminRole } from "@/lib/platform-access/roles";
import { redirect } from "next/navigation";

export default async function Page() {
  const { roleUsuario } = await requireDashboardModuleAccess();

  if (!isOperationalAdminRole(roleUsuario) && roleUsuario !== "dono" && roleUsuario !== "gestor") {
    redirect("/inicio");
  }

  return <ConvitesPageClient />;
}
