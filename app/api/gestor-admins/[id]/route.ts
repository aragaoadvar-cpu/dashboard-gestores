import { createClient } from "@/lib/supabase/server";
import { syncEffectiveProfileActiveState } from "@/lib/platform-access/profile-activity";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";
import { parseRole } from "@/lib/platform-access/roles";

type AcaoGestorAdmin = "remover_gestor_admin" | "reativar_gestor_admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gestorAdminId } = await params;
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

  if (roleUsuario !== "admin") {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { action?: AcaoGestorAdmin };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  if (body.action !== "remover_gestor_admin" && body.action !== "reativar_gestor_admin") {
    return Response.json(
      {
        success: false,
        error:
          "Ação inválida. Use action='remover_gestor_admin' ou action='reativar_gestor_admin'.",
      },
      { status: 400 }
    );
  }

  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", gestorAdminId)
    .maybeSingle();

  if (targetProfileError || !targetProfile || targetProfile.role !== "gestor_admin") {
    return Response.json(
      { success: false, error: "Gestor admin não encontrado ou inválido para esta ação." },
      { status: 404 }
    );
  }

  const { data: invitationData, error: invitationError } = await supabase
    .from("user_invitations")
    .select("id")
    .eq("invite_type", "gestor_admin")
    .eq("invited_by_user_id", user.id)
    .eq("status", "accepted")
    .eq("accepted_by_user_id", gestorAdminId)
    .maybeSingle();

  if (invitationError) {
    return Response.json(
      { success: false, error: `Erro ao validar convite do gestor admin: ${invitationError.message}` },
      { status: 500 }
    );
  }

  if (!invitationData) {
    return Response.json(
      {
        success: false,
        error: "Você só pode gerenciar gestores admin convidados por você na Dashboard.",
      },
      { status: 403 }
    );
  }

  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  const enabled = body.action === "reativar_gestor_admin";
  const { error: dashboardError } = await serviceSupabase
    .from("user_module_permissions")
    .upsert(
      {
        user_id: gestorAdminId,
        module_key: "dashboard_ads",
        enabled,
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
        error: `Erro ao ${enabled ? "liberar" : "revogar"} acesso de Dashboard: ${dashboardError.message}`,
      },
      { status: 500 }
    );
  }

  try {
    await syncEffectiveProfileActiveState(serviceSupabase, gestorAdminId);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar status do gestor admin.",
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: true,
      message: enabled
        ? "Gestor admin reativado com sucesso."
        : "Gestor admin inativado com sucesso.",
    },
    { status: 200 }
  );
}
