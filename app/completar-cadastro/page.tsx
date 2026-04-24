import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CompletarCadastroPageClient from "./CompletarCadastroPageClient";

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
    .select("nome")
    .eq("id", user.id)
    .single();

  if (profileError) {
    redirect("/");
  }

  const nomeAtual = profileData?.nome?.trim() ?? "";
  if (nomeAtual) {
    redirect("/");
  }

  return <CompletarCadastroPageClient />;
}
