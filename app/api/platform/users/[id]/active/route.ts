import { getApiAccessContext } from "@/lib/platform-access/api";
import { findManageableUser } from "@/lib/platform-access/manageable-users";
import {
  getPlatformModuleKeys,
  syncEffectiveProfileActiveState,
} from "@/lib/platform-access/profile-activity";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";

type RouteParams = Promise<{
  id: string;
}>;

export async function PATCH(
  request: Request,
  { params }: { params: RouteParams }
) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  if (!context.canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  let body: { is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  if (typeof body.is_active !== "boolean") {
    return Response.json(
      { success: false, error: "is_active deve ser boolean." },
      { status: 400 }
    );
  }

  if (!targetUserId?.trim()) {
    return Response.json(
      { success: false, error: "ID do usuário não informado." },
      { status: 400 }
    );
  }

  if (targetUserId === context.userId) {
    return Response.json(
      { success: false, error: "Você não pode alterar o próprio status." },
      { status: 403 }
    );
  }

  try {
    const target = await findManageableUser({
      viewerUserId: context.userId,
      viewerRole: context.roleUsuario,
      targetUserId,
    });

    if (!target) {
      return Response.json(
        { success: false, error: "Usuário fora do seu escopo de gestão." },
        { status: 403 }
      );
    }

    if (target.role === "dono") {
      return Response.json(
        { success: false, error: "Não é permitido ativar ou desativar um dono por aqui." },
        { status: 403 }
      );
    }

    if (context.roleUsuario === "admin" && target.role === "admin") {
      return Response.json(
        { success: false, error: "Admin não pode ativar ou desativar outro admin." },
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

    const platformModuleKeys = getPlatformModuleKeys();
    const { data: currentPlatformModules, error: currentPlatformModulesError } = await serviceSupabase
      .from("user_module_permissions")
      .select("module_key")
      .eq("user_id", targetUserId)
      .in("module_key", platformModuleKeys);

    if (currentPlatformModulesError) {
      return Response.json(
        {
          success: false,
          error: `Erro ao carregar módulos da plataforma: ${currentPlatformModulesError.message}`,
        },
        { status: 500 }
      );
    }

    const currentModuleKeys = Array.from(
      new Set((currentPlatformModules ?? []).map((item) => item.module_key))
    );

    if (currentModuleKeys.length === 0) {
      return Response.json(
        { success: false, error: "Usuário não possui módulos da plataforma para atualizar." },
        { status: 400 }
      );
    }

    const { error } = await serviceSupabase.from("user_module_permissions").upsert(
      currentModuleKeys.map((moduleKey) => ({
        user_id: targetUserId,
        module_key: moduleKey,
        enabled: body.is_active,
        granted_by: context.userId,
      })),
      {
        onConflict: "user_id,module_key",
      }
    );

    if (error) {
      return Response.json(
        { success: false, error: `Erro ao atualizar módulos da plataforma: ${error.message}` },
        { status: 500 }
      );
    }

    const isActive = await syncEffectiveProfileActiveState(serviceSupabase, targetUserId);

    return Response.json({ success: true, is_active: isActive });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao atualizar status do usuário.",
      },
      { status: 500 }
    );
  }
}
