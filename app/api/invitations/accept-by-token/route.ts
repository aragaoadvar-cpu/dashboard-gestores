import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/invitations/token";

type AcceptResult = {
  success?: boolean;
  code?: string;
  message?: string;
  invite_type?: "admin" | "gestor" | "auxiliar";
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

  const token = (body.token ?? "").trim();
  let tokenHash: string | null = null;

  if (token) {
    tokenHash = hashInviteToken(token);
  } else {
    const userEmail = user.email?.trim().toLowerCase() ?? "";
    if (!userEmail) {
      return Response.json(
        { success: false, code: "user_email_not_found", error: "Email do usuário não encontrado." },
        { status: 400 }
      );
    }

    const { data: invite, error: inviteError } = await supabase
      .from("user_invitations")
      .select("token_hash")
      .eq("normalized_email", userEmail)
      .eq("status", "pending")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      return Response.json(
        { success: false, error: `Erro ao buscar convite pendente: ${inviteError.message}` },
        { status: 500 }
      );
    }

    if (!invite?.token_hash) {
      return Response.json(
        { success: false, code: "no_pending_invite", error: "Nenhum convite pendente para este usuário." },
        { status: 400 }
      );
    }

    tokenHash = invite.token_hash;
  }

  const { data, error } = await supabase.rpc("accept_invitation_by_token_hash", {
    p_token_hash: tokenHash,
  });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao aceitar convite: ${error.message}` },
      { status: 500 }
    );
  }

  const result = (data as AcceptResult) ?? {
    success: false,
    code: "unknown_error",
    message: "Erro ao processar convite.",
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
      invite_type: result.invite_type ?? null,
      message: result.message ?? "Convite aceito com sucesso.",
    },
    { status: 200 }
  );
}
