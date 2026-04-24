import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerDashboardData } from "@/lib/dashboard/getOwnerDashboardData";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function parseMesAno(url: URL) {
  const now = new Date();
  const mesParam = Number(url.searchParams.get("mes"));
  const anoParam = Number(url.searchParams.get("ano"));

  const mes = Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12
    ? mesParam
    : now.getMonth() + 1;

  const ano = Number.isFinite(anoParam) && anoParam >= 2000 && anoParam <= 2100
    ? anoParam
    : now.getFullYear();

  return { mes, ano };
}

function parseDebug(url: URL) {
  const debugParam = (url.searchParams.get("debug") || "").toLowerCase();
  return debugParam === "1" || debugParam === "true";
}

function getServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingEnvVars: string[] = [];
  if (!supabaseUrl) missingEnvVars.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missingEnvVars.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingEnvVars.length > 0) {
    return { client: null, missingEnvVars };
  }

  const url = supabaseUrl as string;
  const key = serviceRoleKey as string;

  return {
    client: createSupabaseClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    missingEnvVars: [],
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { mes, ano } = parseMesAno(url);
    const debug = parseDebug(url);

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData || profileData.role !== "dono") {
      return NextResponse.json({ error: "Acesso não permitido." }, { status: 403 });
    }

    const { client: serviceSupabase, missingEnvVars } = getServiceSupabaseClient();
    if (!serviceSupabase) {
      return NextResponse.json(
        {
          error: `Dashboard do dono indisponível: configure as variáveis de ambiente no servidor (${missingEnvVars.join(
            ", "
          )}).`,
        },
        { status: 500 }
      );
    }

    // Authorization is validated above with the authenticated user.
    // Service client is used only to read global owner dashboard data safely.
    const data = await getOwnerDashboardData({
      supabase: serviceSupabase,
      mes,
      ano,
      debug,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Erro ao carregar dashboard do dono: ${(error as Error).message}`,
      },
      { status: 500 }
    );
  }
}
