import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ContaDesativadaClient from "./ContaDesativadaClient";

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileData?.is_active !== false) {
    redirect("/inicio");
  }

  return <ContaDesativadaClient />;
}
