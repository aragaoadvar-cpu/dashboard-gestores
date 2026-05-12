import { generateInviteToken } from "@/lib/invitations/token";
import { sendFinanceShareInviteEmail } from "@/lib/platform/email";
import { getApiAccessContext } from "@/lib/platform-access/api";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function GET() {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { userId, hasOwnAliadoModule, supabase } = context;

  if (!hasOwnAliadoModule) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const [sentResp, receivedResp] = await Promise.all([
    supabase
      .from("financeiro_shared_access")
      .select("id, invited_email, permission_level, status, created_at, owner_user_id, escopos")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("financeiro_shared_access")
      .select("id, invited_email, permission_level, status, created_at, owner_user_id, escopos")
      .eq("shared_user_id", userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false }),
  ]);

  if (sentResp.error) {
    return Response.json(
      { success: false, error: `Erro ao listar compartilhamentos: ${sentResp.error.message}` },
      { status: 500 }
    );
  }

  if (receivedResp.error) {
    return Response.json(
      { success: false, error: `Erro ao listar acessos recebidos: ${receivedResp.error.message}` },
      { status: 500 }
    );
  }

  const ownerIds = Array.from(
    new Set((receivedResp.data ?? []).map((item) => item.owner_user_id).filter(Boolean))
  );

  let ownerNamesMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", ownerIds);

    ownerNamesMap = new Map(
      (profilesData ?? []).map((item) => [item.id, item.nome?.trim() || "outro usuário"])
    );
  }

  return Response.json({
    success: true,
    sent: sentResp.data ?? [],
    received: (receivedResp.data ?? []).map((item) => ({
      ...item,
      owner_nome: ownerNamesMap.get(item.owner_user_id) ?? "outro usuário",
    })),
  });
}

export async function POST(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { userId, hasOwnAliadoModule, supabase } = context;

  if (!hasOwnAliadoModule) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: {
    email?: string;
    permission_level?: "view" | "edit";
    escopos?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const permissionLevel = body.permission_level === "edit" ? "edit" : "view";
  const escopos = Array.from(
    new Set((body.escopos ?? []).filter((item) => item === "pessoal" || item === "empresarial"))
  );

  if (!email) {
    return Response.json({ success: false, error: "E-mail é obrigatório." }, { status: 400 });
  }

  if (escopos.length === 0) {
    return Response.json(
      { success: false, error: "Selecione pelo menos um escopo para compartilhar." },
      { status: 400 }
    );
  }

  const token = generateInviteToken();
  const { error } = await supabase.from("financeiro_shared_access").insert({
    owner_user_id: userId,
    invited_email: email,
    token,
    permission_level: permissionLevel,
    escopos,
    status: "pending",
    invited_by: userId,
  });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao criar convite financeiro: ${error.message}` },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const inviteLink = `${origin}/convite-financeiro?token=${encodeURIComponent(token)}`;
  const emailDelivery = await sendFinanceShareInviteEmail({
    toEmail: email,
    inviteLink,
    permissionLabel: permissionLevel === "edit" ? "Pode editar" : "Apenas visualizar",
  });

  return Response.json({
    success: true,
    message: "Convite financeiro enviado com sucesso.",
    invite_link: inviteLink,
    email_delivery: emailDelivery,
  });
}

export async function DELETE(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { userId, hasOwnAliadoModule, supabase } = context;

  if (!hasOwnAliadoModule) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";

  if (!id) {
    return Response.json({ success: false, error: "ID não informado." }, { status: 400 });
  }

  const { error } = await supabase
    .from("financeiro_shared_access")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", userId);

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao remover acesso: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
