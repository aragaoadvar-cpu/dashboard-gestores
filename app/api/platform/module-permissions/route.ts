import { getApiAccessContext } from "@/lib/platform-access/api";
import {
  findManageableUser,
  listManageableUsers,
  type ModuleKey,
} from "@/lib/platform-access/manageable-users";
import { isManageableModuleKey } from "@/lib/platform-access/modules";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";

function isModuleKey(value: unknown): value is ModuleKey {
  return isManageableModuleKey(value);
}

export async function GET() {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  if (!context.canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  try {
    const users = await listManageableUsers({
      viewerUserId: context.userId,
      viewerRole: context.roleUsuario,
    });

    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao listar usuários." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  if (!context.canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { target_user_id?: string; module_key?: ModuleKey; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const targetUserId = body.target_user_id?.trim() ?? "";
  const moduleKey = body.module_key;
  const enabled = Boolean(body.enabled);

  if (!targetUserId || !isModuleKey(moduleKey)) {
    return Response.json(
      { success: false, error: "target_user_id e module_key são obrigatórios." },
      { status: 400 }
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

    if (context.roleUsuario === "admin" && target.role === "dono") {
      return Response.json(
        { success: false, error: "Admin não pode alterar permissões do dono." },
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

    const { error } = await serviceSupabase.from("user_module_permissions").upsert(
      {
        user_id: targetUserId,
        module_key: moduleKey,
        enabled,
        granted_by: context.userId,
      },
      {
        onConflict: "user_id,module_key",
      }
    );

    if (error) {
      return Response.json(
        { success: false, error: `Erro ao atualizar permissão: ${error.message}` },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao atualizar permissão.",
      },
      { status: 500 }
    );
  }
}
