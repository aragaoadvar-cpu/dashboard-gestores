import { createClient } from "@/lib/supabase/server";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: auxiliarId } = await params;
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
      : actorProfile.role === "gestor"
      ? "gestor"
      : "auxiliar";

  if (roleUsuario !== "admin" && roleUsuario !== "gestor" && roleUsuario !== "dono") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { action?: "remover_auxiliar" };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  if (body.action !== "remover_auxiliar") {
    return Response.json(
      { success: false, error: "Ação inválida. Use action='remover_auxiliar'." },
      { status: 400 }
    );
  }

  const { data: auxiliarProfile, error: auxiliarProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", auxiliarId)
    .maybeSingle();

  if (auxiliarProfileError || !auxiliarProfile || auxiliarProfile.role !== "auxiliar") {
    return Response.json(
      { success: false, error: "Auxiliar não encontrado ou inválido para esta ação." },
      { status: 404 }
    );
  }

  let vinculoQuery = supabase
    .from("auxiliar_vinculos")
    .select("id")
    .eq("auxiliar_user_id", auxiliarId)
    .eq("status", "ativo");

  if (roleUsuario === "admin" || roleUsuario === "gestor") {
    vinculoQuery = vinculoQuery.eq("owner_user_id", user.id);
  }

  const { data: vinculoData, error: vinculoError } = await vinculoQuery.maybeSingle();

  if (vinculoError) {
    return Response.json(
      { success: false, error: `Erro ao validar vínculo do auxiliar: ${vinculoError.message}` },
      { status: 500 }
    );
  }

  if (!vinculoData) {
    return Response.json(
      { success: false, error: "Você só pode inativar auxiliares vinculados ao seu escopo." },
      { status: 403 }
    );
  }

  let inativarQuery = supabase
    .from("auxiliar_vinculos")
    .update({ status: "inativo", updated_at: new Date().toISOString() })
    .eq("auxiliar_user_id", auxiliarId)
    .eq("status", "ativo");

  if (roleUsuario === "admin" || roleUsuario === "gestor") {
    inativarQuery = inativarQuery.eq("owner_user_id", user.id);
  }

  const { error: inativarError } = await inativarQuery;

  if (inativarError) {
    return Response.json(
      { success: false, error: `Erro ao inativar auxiliar: ${inativarError.message}` },
      { status: 500 }
    );
  }

  return Response.json(
    { success: true, message: "Auxiliar inativado com sucesso." },
    { status: 200 }
  );
}
