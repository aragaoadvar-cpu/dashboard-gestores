import HomePageClient from "./HomePageClient";
import OwnerDashboardClient from "./OwnerDashboardClient";
import { getOwnerDashboardData } from "@/lib/dashboard/getOwnerDashboardData";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";

export default async function Page() {
  const { roleUsuario, supabase } = await requireDashboardModuleAccess();

  if (roleUsuario === "dono") {
    const hoje = new Date();
    const initialMes = hoje.getMonth() + 1;
    const initialAno = hoje.getFullYear();
    const initialData = await getOwnerDashboardData({
      supabase,
      mes: initialMes,
      ano: initialAno,
    });

    return (
      <OwnerDashboardClient
        initialData={initialData}
        initialMes={initialMes}
        initialAno={initialAno}
      />
    );
  }

  return <HomePageClient />;
}
