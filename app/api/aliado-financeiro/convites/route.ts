import { generateInviteToken } from "@/lib/invitations/token";
import { sendFinanceShareInviteEmail } from "@/lib/platform/email";
import { getApiAccessContext } from "@/lib/platform-access/api";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findExistingUserIdByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const serviceSupabase = getPlatformServiceSupabaseClient();

  if (!serviceSupabase || !normalizedEmail) {
    return null;
  }

  const { data: profileByEmail } = await serviceSupabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileByEmail?.id) {
    return profileByEmail.id;
  }

  const { data: acceptedPlatformInvite } = await serviceSupabase
    .from("platform_user_invitations")
    .select("accepted_by_user_id")
    .eq("email", normalizedEmail)
    .eq("status", "accepted")
    .not("accepted_by_user_id", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedPlatformInvite?.accepted_by_user_id) {
    return acceptedPlatformInvite.accepted_by_user_id;
  }

  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const response = await serviceSupabase.auth.admin.listUsers({
      page,
      perPage,
    });

    const users = response.data?.users ?? [];
    const matchedUser = users.find(
      (user) => normalizeEmail(user.email ?? "") === normalizedEmail
    );

    if (matchedUser?.id) {
      return matchedUser.id;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
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
      .select(
        "id, invited_email, permission_level, status, created_at, owner_user_id, escopos, token, shared_user_id, accepted_at"
      )
      .eq("owner_user_id", userId)
      .in("status", ["pending", "accepted"])
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

  const sentItems = sentResp.data ?? [];
  const ownerIds = Array.from(
    new Set((receivedResp.data ?? []).map((item) => item.owner_user_id).filter(Boolean))
  );
  const sharedUserIds = Array.from(
    new Set(sentItems.map((item) => item.shared_user_id).filter(Boolean))
  );
  const pendingEmails = Array.from(
    new Set(
      sentItems
        .filter((item) => !item.shared_user_id)
        .map((item) => normalizeEmail(item.invited_email))
        .filter(Boolean)
    )
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

  const serviceSupabase = getPlatformServiceSupabaseClient();
  const sharedUserNamesMap = new Map<string, string>();
  const sharedUserEmailsMap = new Map<string, string>();
  const pendingEmailNamesMap = new Map<string, string>();

  if (serviceSupabase && sharedUserIds.length > 0) {
    const { data: sharedProfiles } = await serviceSupabase
      .from("profiles")
      .select("id, nome, email")
      .in("id", sharedUserIds);

    for (const item of sharedProfiles ?? []) {
      const nome = item.nome?.trim();
      const email = normalizeEmail(item.email ?? "");

      if (nome) {
        sharedUserNamesMap.set(item.id, nome);
      }

      if (email) {
        sharedUserEmailsMap.set(item.id, email);
      }
    }
  }

  if (serviceSupabase && pendingEmails.length > 0) {
    const { data: pendingProfiles } = await serviceSupabase
      .from("profiles")
      .select("nome, email")
      .in("email", pendingEmails);

    for (const item of pendingProfiles ?? []) {
      const email = normalizeEmail(item.email ?? "");
      const nome = item.nome?.trim();

      if (email && nome) {
        pendingEmailNamesMap.set(email, nome);
      }
    }
  }

  return Response.json({
    success: true,
    sent: sentItems.map((item) => {
      const normalizedEmail = normalizeEmail(item.invited_email);
      const sharedUserId = item.shared_user_id ?? null;

      return {
        ...item,
        shared_user_id: sharedUserId,
        shared_user_nome:
          (sharedUserId ? sharedUserNamesMap.get(sharedUserId) : null) ??
          pendingEmailNamesMap.get(normalizedEmail) ??
          null,
        shared_user_email:
          (sharedUserId ? sharedUserEmailsMap.get(sharedUserId) : null) ?? normalizedEmail,
      };
    }),
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

  const existingUserId = await findExistingUserIdByEmail(email);

  if (existingUserId && existingUserId === userId) {
    return Response.json(
      { success: false, error: "Você não pode compartilhar seu Aliado com o próprio usuário dono." },
      { status: 400 }
    );
  }

  const { data: existingShare, error: existingShareError } = await supabase
    .from("financeiro_shared_access")
    .select("id, token, status")
    .eq("owner_user_id", userId)
    .eq("invited_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingShareError) {
    return Response.json(
      { success: false, error: `Erro ao localizar compartilhamento existente: ${existingShareError.message}` },
      { status: 500 }
    );
  }

  if (existingUserId) {
    const activePayload = {
      invited_email: email,
      permission_level: permissionLevel,
      escopos,
      shared_user_id: existingUserId,
      status: "accepted" as const,
      accepted_at: new Date().toISOString(),
      invited_by: userId,
    };

    if (existingShare?.id) {
      const { error } = await supabase
        .from("financeiro_shared_access")
        .update(activePayload)
        .eq("id", existingShare.id)
        .eq("owner_user_id", userId);

      if (error) {
        return Response.json(
          { success: false, error: `Erro ao reativar compartilhamento financeiro: ${error.message}` },
          { status: 500 }
        );
      }
    } else {
      const token = generateInviteToken();
      const { error } = await supabase.from("financeiro_shared_access").insert({
        owner_user_id: userId,
        token,
        ...activePayload,
      });

      if (error) {
        return Response.json(
          { success: false, error: `Erro ao criar compartilhamento financeiro: ${error.message}` },
          { status: 500 }
        );
      }
    }

    return Response.json({
      success: true,
      message: "Compartilhamento financeiro ativado com sucesso.",
      direct_access: true,
    });
  }

  const token = existingShare?.token ?? generateInviteToken();
  const pendingPayload = {
    invited_email: email,
    permission_level: permissionLevel,
    escopos,
    shared_user_id: null,
    status: "pending" as const,
    accepted_at: null,
    invited_by: userId,
  };

  if (existingShare?.id) {
    const { error } = await supabase
      .from("financeiro_shared_access")
      .update({
        ...pendingPayload,
        token,
      })
      .eq("id", existingShare.id)
      .eq("owner_user_id", userId);

    if (error) {
      return Response.json(
        { success: false, error: `Erro ao atualizar convite financeiro: ${error.message}` },
        { status: 500 }
      );
    }
  } else {
    const { error } = await supabase.from("financeiro_shared_access").insert({
      owner_user_id: userId,
      token,
      ...pendingPayload,
    });

    if (error) {
      return Response.json(
        { success: false, error: `Erro ao criar convite financeiro: ${error.message}` },
        { status: 500 }
      );
    }
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
    direct_access: false,
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

  const { data: share, error: shareError } = await supabase
    .from("financeiro_shared_access")
    .select("id, status")
    .eq("id", id)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (shareError) {
    return Response.json(
      { success: false, error: `Erro ao localizar compartilhamento: ${shareError.message}` },
      { status: 500 }
    );
  }

  if (!share) {
    return Response.json(
      { success: false, error: "Compartilhamento fora do seu escopo." },
      { status: 404 }
    );
  }

  if (share.status !== "pending" && share.status !== "accepted") {
    return Response.json(
      { success: false, error: "Esse compartilhamento já foi encerrado." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("financeiro_shared_access")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("owner_user_id", userId)
    .eq("status", share.status)
    .select("id");

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao revogar compartilhamento: ${error.message}` },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    return Response.json(
      { success: false, error: "Compartilhamento não encontrado para revogação." },
      { status: 404 }
    );
  }

  return Response.json({
    success: true,
    message:
      share.status === "pending"
        ? "Convite cancelado com sucesso."
        : "Acesso ao Aliado removido com sucesso.",
  });
}

export async function PATCH(request: Request) {
  const context = await getApiAccessContext();
  if (!context.ok) {
    return Response.json({ success: false, error: context.error }, { status: context.status });
  }

  const { userId, hasOwnAliadoModule, supabase } = context;

  if (!hasOwnAliadoModule) {
    return Response.json({ success: false, error: "Acesso não permitido." }, { status: 403 });
  }

  let body: {
    id?: string;
    permission_level?: "view" | "edit";
    escopos?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  const permissionLevel = body.permission_level === "edit" ? "edit" : "view";
  const escopos = Array.from(
    new Set((body.escopos ?? []).filter((item) => item === "pessoal" || item === "empresarial"))
  );

  if (!id) {
    return Response.json({ success: false, error: "ID não informado." }, { status: 400 });
  }

  if (escopos.length === 0) {
    return Response.json(
      { success: false, error: "Selecione pelo menos um escopo para compartilhar." },
      { status: 400 }
    );
  }

  const { data: share, error: shareError } = await supabase
    .from("financeiro_shared_access")
    .select("id, status")
    .eq("id", id)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (shareError) {
    return Response.json(
      { success: false, error: `Erro ao localizar compartilhamento: ${shareError.message}` },
      { status: 500 }
    );
  }

  if (!share) {
    return Response.json(
      { success: false, error: "Compartilhamento fora do seu escopo." },
      { status: 404 }
    );
  }

  if (share.status !== "pending" && share.status !== "accepted") {
    return Response.json(
      { success: false, error: "Esse compartilhamento não pode mais ser editado." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("financeiro_shared_access")
    .update({
      permission_level: permissionLevel,
      escopos,
    })
    .eq("id", id)
    .eq("owner_user_id", userId)
    .eq("status", share.status)
    .select(
      "id, invited_email, permission_level, status, created_at, owner_user_id, escopos, token, shared_user_id, accepted_at"
    )
    .maybeSingle();

  if (error) {
    return Response.json(
      { success: false, error: `Erro ao atualizar compartilhamento: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    message:
      share.status === "pending"
        ? "Convite atualizado com sucesso."
        : "Acesso atualizado com sucesso.",
    share: data,
  });
}
