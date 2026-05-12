import ConvitesPageClient from "./ConvitesPageClient";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const { roleUsuario } = await requireDashboardModuleAccess();

  if (roleUsuario !== "admin" && roleUsuario !== "dono" && roleUsuario !== "gestor") {
    redirect("/inicio");
  }

  return <ConvitesPageClient />;
}
