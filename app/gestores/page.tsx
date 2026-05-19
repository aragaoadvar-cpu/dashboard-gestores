import GestoresPageClient from "./GestoresPageClient";
import { redirect } from "next/navigation";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";
import { isOperationalAdminRole } from "@/lib/platform-access/roles";

export default async function Page() {
  const { roleUsuario } = await requireDashboardModuleAccess();

  if (!isOperationalAdminRole(roleUsuario) && roleUsuario !== "dono") {
    redirect("/inicio");
  }

  return <GestoresPageClient />;
}
