import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseRole } from "@/lib/platform-access/roles";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const rotaPublica =
    pathname.startsWith("/login") ||
    pathname.startsWith("/convite") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  const rotaSemValidacaoOperacionalDashboard =
    pathname.startsWith("/inicio") ||
    pathname.startsWith("/configuracao") ||
    pathname.startsWith("/completar-cadastro") ||
    pathname.startsWith("/conta-desativada") ||
    pathname.startsWith("/aliado-financeiro") ||
    pathname.startsWith("/api/platform/") ||
    pathname.startsWith("/api/aliado-financeiro/");

  if (!user || rotaPublica) {
    return response;
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const roleUsuario = parseRole(profileData?.role);

  if (roleUsuario === "gestor") {
    const rotaApiAceiteConvite = pathname.startsWith("/api/invitations/accept-by-token");
    if (rotaApiAceiteConvite || rotaSemValidacaoOperacionalDashboard) {
      return response;
    }

    const { data: vinculoAtivo } = await supabase
      .from("admin_gestores")
      .select("id")
      .eq("gestor_user_id", user.id)
      .eq("status", "ativo")
      .maybeSingle();

    if (!vinculoAtivo) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { success: false, error: "Acesso bloqueado: gestor sem vínculo ativo." },
          { status: 403 }
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("reason", "vinculo_inativo");
      return NextResponse.redirect(loginUrl);
    }
  }

  if (roleUsuario === "auxiliar") {
    const rotaApiAceiteConvite = pathname.startsWith("/api/invitations/accept-by-token");
    if (rotaApiAceiteConvite || rotaSemValidacaoOperacionalDashboard) {
      return response;
    }

    const { data: ownerIdAuxiliar, error: ownerIdAuxiliarError } = await supabase.rpc(
      "get_auxiliar_owner_id",
      { check_auxiliar_id: user.id }
    );

    if (ownerIdAuxiliarError || !ownerIdAuxiliar) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { success: false, error: "Acesso bloqueado: auxiliar sem vínculo ativo." },
          { status: 403 }
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("reason", "vinculo_inativo");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}
