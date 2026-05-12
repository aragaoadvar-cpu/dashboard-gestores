import GestoresPageClient from "./GestoresPageClient";
import { redirect } from "next/navigation";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";

export default async function Page() {
  const { roleUsuario } = await requireDashboardModuleAccess();

  if (roleUsuario !== "admin" && roleUsuario !== "dono") {
    redirect("/inicio");
  }

  return <GestoresPageClient />;
}
