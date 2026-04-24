import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HomePageClient from "./HomePageClient";
import OwnerDashboardClient from "./OwnerDashboardClient";
import { getOwnerDashboardData } from "@/lib/dashboard/getOwnerDashboardData";

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("nome, role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    redirect("/login");
  }

  const nomeAtual = profileData?.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

  if (profileData.role === "dono") {
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
