import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConvitesPageClient from "./ConvitesPageClient";

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
    .select("role, nome")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    redirect("/");
  }

  if (
    profileData.role !== "admin" &&
    profileData.role !== "dono" &&
    profileData.role !== "gestor"
  ) {
    redirect("/");
  }

  const nomeAtual = profileData.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

  return <ConvitesPageClient />;
}
