import { generateInviteToken } from "@/lib/invitations/token";
import { sendPlatformInviteEmail } from "@/lib/platform/email";
import { getApiAccessContext } from "@/lib/platform-access/api";
import { type ManageableModuleKey } from "@/lib/platform-access/modules";

type InviteModuleKey = Exclude<ManageableModuleKey, "dashboard_ads">;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isInviteModuleKey(value: unknown): value is InviteModuleKey {
  return (
    value === "aliado_financeiro_pessoal" ||
    value === "aliado_financeiro_empresarial"
  );
}

export async function GET() {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { canManagePlatformUsers, userId, supabase } = context;

  if (!canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("platform_user_invitations")
    .select("id, email, nome, token, modules, status, created_at, accepted_at")
    .eq("invited_by", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao listar convites: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({ success: true, invitations: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { canManagePlatformUsers, userId, supabase } = context;

  if (!canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { nome?: string; email?: string; modules?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const nome = body.nome?.trim() ?? "";
  const email = normalizeEmail(body.email ?? "");
  const modules = (body.modules ?? []).filter(isInviteModuleKey);

  if (!nome || !email) {
    return Response.json(
      { success: false, error: "Nome e e-mail são obrigatórios." },
      { status: 400 }
    );
  }

  if (modules.length === 0) {
    return Response.json(
      { success: false, error: "Selecione pelo menos um módulo." },
      { status: 400 }
    );
  }

  const token = generateInviteToken();

  const { error } = await supabase.from("platform_user_invitations").insert({
    email,
    nome,
    invited_by: userId,
    token,
    modules,
    status: "pending",
  });

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao criar convite: ${error.message}` },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const inviteLink = `${origin}/convite-plataforma?token=${encodeURIComponent(token)}`;
  const emailDelivery = await sendPlatformInviteEmail({
    toEmail: email,
    inviteLink,
    modules: modules.map((moduleKey) =>
      moduleKey === "aliado_financeiro_pessoal"
        ? "Aliado Financeiro Pessoal"
        : "Aliado Financeiro Empresarial"
    ),
  });

  return Response.json({
    success: true,
    message: "Convite da plataforma criado com sucesso.",
    invite_link: inviteLink,
    email_delivery: emailDelivery,
  });
}

export async function PATCH(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { canManagePlatformUsers, userId, supabase } = context;

  if (!canManagePlatformUsers) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: { invitation_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const invitationId = body.invitation_id?.trim() ?? "";
  const action = body.action?.trim() ?? "";

  if (!invitationId || action !== "revoke") {
    return Response.json(
      { success: false, error: "invitation_id e action=revoke são obrigatórios." },
      { status: 400 }
    );
  }

  const { data: invite, error: inviteError } = await supabase
    .from("platform_user_invitations")
    .select("id, status")
    .eq("id", invitationId)
    .eq("invited_by", userId)
    .maybeSingle();

  if (inviteError) {
    return Response.json(
      { success: false, error: `Erro ao localizar convite: ${inviteError.message}` },
      { status: 500 }
    );
  }

  if (!invite) {
    return Response.json(
      { success: false, error: "Convite fora do seu escopo de gestão." },
      { status: 403 }
    );
  }

  if (invite.status !== "pending") {
    return Response.json(
      { success: false, error: "Só é possível cancelar convites pendentes." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("platform_user_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("invited_by", userId)
    .eq("status", "pending");

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao cancelar convite: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    message: "Convite cancelado com sucesso.",
  });
}
