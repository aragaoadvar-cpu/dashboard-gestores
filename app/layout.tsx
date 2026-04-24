import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import AppShell from "./AppShell";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let roleUsuario: "dono" | "admin" | "gestor" | "auxiliar" | null = null;

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    roleUsuario =
      profileData?.role === "dono"
        ? "dono"
        : profileData?.role === "admin"
        ? "admin"
        : profileData?.role === "auxiliar"
        ? "auxiliar"
        : profileData?.role === "gestor"
        ? "gestor"
        : null;
  }

  return (
    <html lang="pt-br">
      <body>
        <AppShell roleUsuario={roleUsuario}>{children}</AppShell>
      </body>
    </html>
  );
}
