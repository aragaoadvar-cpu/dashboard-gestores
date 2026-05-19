import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { syncEffectiveProfileActiveState } from "@/lib/platform-access/profile-activity";
import {
  isOperationalAdminRole,
  parseRole,
  type RoleUsuario,
} from "@/lib/platform-access/roles";

type AcaoGestor = "remover_gestor" | "reativar_gestor" | "tornar_administrador";

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

async function setDashboardAccessForUser(
  gestorId: string,
  grantedByUserId: string,
  enabled: boolean
) {
  const serviceSupabase = getServiceSupabaseClient();
  if (!serviceSupabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const { error } = await serviceSupabase.from("user_module_permissions").upsert(
    {
      user_id: gestorId,
      module_key: "dashboard_ads",
      enabled,
      granted_by: grantedByUserId,
    },
    {
      onConflict: "user_id,module_key",
    }
  );

  if (error) {
    throw new Error(
      `${enabled ? "Erro ao liberar" : "Erro ao revogar"} acesso da Dashboard: ${error.message}`
    );
  }

  await syncEffectiveProfileActiveState(serviceSupabase, gestorId);
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

  const roleUsuario = parseRole(actorProfile.role);

  if (!roleUsuario || roleUsuario === "gestor" || roleUsuario === "auxiliar") {
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

  if (isOperationalAdminRole(roleUsuario)) {
    const { data: vinculo, error: vinculoError } = await supabase
      .from("admin_gestores")
      .select("id")
      .eq("admin_user_id", user.id)
      .eq("gestor_user_id", gestorId)
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
  if (
    action !== "remover_gestor" &&
    action !== "reativar_gestor" &&
    action !== "tornar_administrador"
  ) {
    return Response.json(
      {
        success: false,
        error:
          "Ação inválida. Use 'remover_gestor', 'reativar_gestor' ou 'tornar_administrador'.",
      },
      { status: 400 }
    );
  }

  const statusOrigem = action === "reativar_gestor" ? "inativo" : "ativo";
  const statusDestino = action === "reativar_gestor" ? "ativo" : "inativo";
  const serviceSupabase = getServiceSupabaseClient();
  if (!serviceSupabase) {
    return Response.json(
      {
        success: false,
        error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.",
      },
      { status: 500 }
    );
  }

  let vinculoUpdateQuery = serviceSupabase
    .from("admin_gestores")
    .update({ status: statusDestino })
    .eq("gestor_user_id", gestorId)
    .eq("status", statusOrigem);

  if (isOperationalAdminRole(roleUsuario)) {
    vinculoUpdateQuery = vinculoUpdateQuery.eq("admin_user_id", user.id);
  }

  const { data: vinculoAtualizado, error: vinculoUpdateError } = await vinculoUpdateQuery
    .select("id")
    .maybeSingle();

  if (vinculoUpdateError) {
    return Response.json(
      {
        success: false,
        error: `Erro ao atualizar vínculo do gestor: ${vinculoUpdateError.message}`,
      },
      { status: 500 }
    );
  }

  if (!vinculoAtualizado) {
    return Response.json(
      {
        success: false,
        error:
          action === "reativar_gestor"
            ? "Nenhum vínculo inativo foi encontrado para reativar este gestor."
            : "Nenhum vínculo ativo foi encontrado para inativar este gestor.",
      },
      { status: 409 }
    );
  }

  if (action === "remover_gestor") {
    try {
      await setDashboardAccessForUser(gestorId, user.id, false);
    } catch (error) {
      return Response.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao revogar acesso de Dashboard do gestor.",
        },
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, action, message: "Gestor removido da equipe com sucesso." },
      { status: 200 }
    );
  }

  if (action === "reativar_gestor") {
    try {
      await setDashboardAccessForUser(gestorId, user.id, true);
    } catch (error) {
      return Response.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao liberar acesso de Dashboard do gestor.",
        },
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, action, message: "Gestor reativado com sucesso." },
      { status: 200 }
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
