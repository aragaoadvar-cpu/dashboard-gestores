import { createClient } from "@/lib/supabase/server";

type AcceptResult = {
  success?: boolean;
  code?: string;
  message?: string;
  owner_user_id?: string;
  permission_level?: "view" | "edit";
  escopos?: Array<"pessoal" | "empresarial">;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const token = body.token?.trim() ?? "";

  const { data, error } = await supabase.rpc("accept_financeiro_shared_invite", {
    p_token: token,
  });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao aceitar convite financeiro: ${error.message}` },
      { status: 500 }
    );
  }

  const result = (data as AcceptResult) ?? {
    success: false,
    code: "unknown_error",
    message: "Erro ao processar o convite financeiro.",
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
      owner_user_id: result.owner_user_id ?? null,
      permission_level: result.permission_level ?? "view",
      escopos: result.escopos ?? [],
    },
    { status: 200 }
  );
}
