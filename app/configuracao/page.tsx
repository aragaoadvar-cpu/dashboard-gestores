import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConfiguracaoPageClient from "./ConfiguracaoPageClient";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileDataComAvatar, error: profileErrorComAvatar } = await supabase
    .from("profiles")
    .select("role, nome")
    .eq("id", user.id)
    .single();

  let profileData:
    | {
        role: string | null;
        nome: string | null;
      }
    | null = null;

  if (!profileErrorComAvatar && profileDataComAvatar) {
    profileData = profileDataComAvatar as {
      role: string | null;
      nome: string | null;
    };
  } else {
    const { data: profileDataSemAvatar, error: profileErrorSemAvatar } = await supabase
      .from("profiles")
      .select("role, nome")
      .eq("id", user.id)
      .single();

    if (profileErrorSemAvatar || !profileDataSemAvatar) {
      redirect("/login");
    }

    profileData = {
      role: profileDataSemAvatar.role ?? null,
      nome: profileDataSemAvatar.nome ?? null,
    };
  }

  const roleUsuario =
    profileData.role === "dono"
      ? "dono"
      : profileData.role === "admin"
      ? "admin"
      : profileData.role === "auxiliar"
      ? "auxiliar"
      : "gestor";

  const nomeAtual = profileData.nome?.trim() ?? "";
  if (!nomeAtual) {
    redirect("/completar-cadastro");
  }

  return (
    <ConfiguracaoPageClient
      nomeInicial={nomeAtual}
      emailAtual={user.email ?? ""}
      roleAtual={roleUsuario as RoleUsuario}
    />
  );
}
