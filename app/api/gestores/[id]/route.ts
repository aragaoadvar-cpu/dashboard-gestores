import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type RoleUsuario = "dono" | "admin" | "gestor";
type AcaoGestor = "remover_gestor" | "tornar_administrador";

function getServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createSupabaseClient(supabaseUrl as string, serviceRoleKey as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gestorId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (actorProfileError || !actorProfile) {
    return Response.json(
      { success: false, error: "Não foi possível carregar o perfil do usuário." },
      { status: 500 }
    );
  }

  const roleUsuario: RoleUsuario =
    actorProfile.role === "dono"
      ? "dono"
      : actorProfile.role === "admin"
      ? "admin"
      : "gestor";

  if (roleUsuario === "gestor") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const { data: gestorProfile, error: gestorProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", gestorId)
    .maybeSingle();

  if (gestorProfileError || !gestorProfile || gestorProfile.role !== "gestor") {
    return Response.json(
      { success: false, error: "Gestor não encontrado ou inválido para esta ação." },
      { status: 404 }
    );
  }

  if (roleUsuario === "admin") {
    const { data: vinculo, error: vinculoError } = await supabase
      .from("admin_gestores")
      .select("id")
      .eq("admin_user_id", user.id)
      .eq("gestor_user_id", gestorId)
      .eq("status", "ativo")
      .maybeSingle();

    if (vinculoError || !vinculo) {
      return Response.json(
        { success: false, error: "Você só pode gerenciar gestores vinculados à sua equipe." },
        { status: 403 }
      );
    }
  }

  let body: { action?: AcaoGestor };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "remover_gestor" && action !== "tornar_administrador") {
    return Response.json(
      { success: false, error: "Ação inválida. Use 'remover_gestor' ou 'tornar_administrador'." },
      { status: 400 }
    );
  }

  let vinculoQuery = supabase
    .from("admin_gestores")
    .update({ status: "inativo" })
    .eq("gestor_user_id", gestorId)
    .eq("status", "ativo");

  if (roleUsuario === "admin") {
    vinculoQuery = vinculoQuery.eq("admin_user_id", user.id);
  }

  const { error: vinculoUpdateError } = await vinculoQuery;

  if (vinculoUpdateError) {
    return Response.json(
      { success: false, error: `Erro ao atualizar vínculo do gestor: ${vinculoUpdateError.message}` },
      { status: 500 }
    );
  }

  if (action === "remover_gestor") {
    return Response.json(
      { success: true, action, message: "Gestor removido da equipe com sucesso." },
      { status: 200 }
    );
  }

  const serviceSupabase = getServiceSupabaseClient();
  if (!serviceSupabase) {
    return Response.json(
      {
        success: false,
        error:
          "Promoção indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor para concluir esta ação.",
      },
      { status: 500 }
    );
  }

  const { error: roleUpdateError } = await serviceSupabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", gestorId)
    .eq("role", "gestor");

  if (roleUpdateError) {
    return Response.json(
      { success: false, error: `Erro ao promover gestor: ${roleUpdateError.message}` },
      { status: 500 }
    );
  }

  return Response.json(
    { success: true, action, message: "Gestor promovido para administrador com sucesso." },
    { status: 200 }
  );
}
