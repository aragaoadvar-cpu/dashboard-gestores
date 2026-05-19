import { createClient } from "@/lib/supabase/server";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";
import { syncEffectiveProfileActiveState } from "@/lib/platform-access/profile-activity";
import { isOperationalAdminRole, parseRole } from "@/lib/platform-access/roles";

type AcaoAuxiliar = "remover_auxiliar" | "reativar_auxiliar";

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

  const roleUsuario = parseRole(actorProfile.role);

  if (!roleUsuario || (!isOperationalAdminRole(roleUsuario) && roleUsuario !== "gestor" && roleUsuario !== "dono")) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { action?: AcaoAuxiliar };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  if (body.action !== "remover_auxiliar" && body.action !== "reativar_auxiliar") {
    return Response.json(
      {
        success: false,
        error: "Ação inválida. Use action='remover_auxiliar' ou action='reativar_auxiliar'.",
      },
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
    .eq("status", body.action === "reativar_auxiliar" ? "inativo" : "ativo");

  if (isOperationalAdminRole(roleUsuario) || roleUsuario === "gestor") {
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
      {
        success: false,
        error: "Você só pode gerenciar auxiliares vinculados ao seu escopo.",
      },
      { status: 403 }
    );
  }

  const statusDestino = body.action === "reativar_auxiliar" ? "ativo" : "inativo";
  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let atualizarVinculoQuery = serviceSupabase
    .from("auxiliar_vinculos")
    .update({ status: statusDestino, updated_at: new Date().toISOString() })
    .eq("auxiliar_user_id", auxiliarId)
    .eq("status", body.action === "reativar_auxiliar" ? "inativo" : "ativo");

  if (isOperationalAdminRole(roleUsuario) || roleUsuario === "gestor") {
    atualizarVinculoQuery = atualizarVinculoQuery.eq("owner_user_id", user.id);
  }

  const { data: vinculoAtualizado, error: atualizarVinculoError } = await atualizarVinculoQuery
    .select("id")
    .maybeSingle();

  if (atualizarVinculoError) {
    return Response.json(
      {
        success: false,
        error: `Erro ao ${
          body.action === "reativar_auxiliar" ? "reativar" : "inativar"
        } auxiliar: ${atualizarVinculoError.message}`,
      },
      { status: 500 }
    );
  }

  if (!vinculoAtualizado) {
    return Response.json(
      {
        success: false,
        error:
          body.action === "reativar_auxiliar"
            ? "Nenhum vínculo inativo foi encontrado para reativar este auxiliar."
            : "Nenhum vínculo ativo foi encontrado para inativar este auxiliar.",
      },
      { status: 409 }
    );
  }

  const { error: dashboardError } = await serviceSupabase.from("user_module_permissions").upsert(
    {
      user_id: auxiliarId,
      module_key: "dashboard_ads",
      enabled: body.action === "reativar_auxiliar",
      granted_by: user.id,
    },
    {
      onConflict: "user_id,module_key",
    }
  );

  if (dashboardError) {
    return Response.json(
      {
        success: false,
        error: `Erro ao ${
          body.action === "reativar_auxiliar" ? "liberar" : "revogar"
        } acesso de Dashboard: ${dashboardError.message}`,
      },
      { status: 500 }
    );
  }

  try {
    await syncEffectiveProfileActiveState(serviceSupabase, auxiliarId);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar status do auxiliar.",
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: true,
      message:
        body.action === "reativar_auxiliar"
          ? "Auxiliar reativado com sucesso."
          : "Auxiliar inativado com sucesso.",
    },
    { status: 200 }
  );
}
