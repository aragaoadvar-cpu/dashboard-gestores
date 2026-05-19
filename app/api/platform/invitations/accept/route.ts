import { createClient } from "@/lib/supabase/server";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";

type AcceptResult = {
  success?: boolean;
  code?: string;
  message?: string;
  modules?: string[];
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  let body: { token?: string; nome?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const token = body.token?.trim() ?? "";
  const nome = body.nome?.trim() ?? "";
  const email = user.email?.trim().toLowerCase() ?? "";

  if (!token) {
    return Response.json({ success: false, error: "Token inválido." }, { status: 400 });
  }

  if (!nome) {
    return Response.json({ success: false, error: "Nome é obrigatório." }, { status: 400 });
  }

  const serviceSupabase = getPlatformServiceSupabaseClient();
  if (!serviceSupabase) {
    return Response.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  const { data: invite, error: inviteError } = await serviceSupabase
    .from("platform_user_invitations")
    .select("id, email, status")
    .eq("token", token)
    .maybeSingle();

  if (inviteError) {
    return Response.json(
      { success: false, error: `Erro ao validar convite da plataforma: ${inviteError.message}` },
      { status: 500 }
    );
  }

  if (!invite) {
    return Response.json(
      { success: false, code: "invite_not_found", error: "Convite da plataforma não encontrado." },
      { status: 400 }
    );
  }

  if (invite.status !== "pending") {
    return Response.json(
      {
        success: false,
        code: "invite_not_pending",
        error: "Este convite da plataforma não está mais pendente.",
      },
      { status: 400 }
    );
  }

  if ((invite.email ?? "").trim().toLowerCase() !== email) {
    return Response.json(
      {
        success: false,
        code: "email_mismatch",
        error: "Este convite pertence a outro email.",
      },
      { status: 400 }
    );
  }

  const { error: nomeError } = await supabase.rpc("update_my_profile_name", {
    p_nome: nome,
  });

  if (nomeError) {
    return Response.json(
      { success: false, error: `Erro ao salvar nome do perfil: ${nomeError.message}` },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.rpc("accept_platform_invitation", {
    p_token: token,
  });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao aceitar convite da plataforma: ${error.message}` },
      { status: 500 }
    );
  }

  const result = (data as AcceptResult) ?? {
    success: false,
    code: "unknown_error",
    message: "Erro ao processar o convite da plataforma.",
  };

  if (!result.success) {
    return Response.json(
      { success: false, code: result.code, error: result.message ?? "Convite inválido." },
      { status: 400 }
    );
  }

  return Response.json(
    {
      success: true,
      message: result.message ?? "Convite aceito com sucesso.",
      modules: result.modules ?? [],
    },
    { status: 200 }
  );
}
