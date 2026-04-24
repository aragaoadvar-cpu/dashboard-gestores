type InviteType = "admin" | "gestor" | "auxiliar";

export type InviteEmailDelivery = {
  status: "sent" | "not_configured" | "failed";
  message: string;
};

type SendInviteEmailParams = {
  toEmail: string;
  inviteLink: string;
  inviteType: InviteType;
  expiresAt: string;
};

export async function sendInviteEmail({
  toEmail,
  inviteLink,
  inviteType,
  expiresAt,
}: SendInviteEmailParams): Promise<InviteEmailDelivery> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVITE_EMAIL_FROM;

  if (!resendApiKey || !fromEmail) {
    return {
      status: "not_configured",
      message:
        "Envio de email não configurado (RESEND_API_KEY / INVITE_EMAIL_FROM ausentes).",
    };
  }

  const subject =
    inviteType === "admin"
      ? "Convite para entrar como Admin"
      : inviteType === "gestor"
      ? "Convite para entrar como Gestor"
      : "Convite para entrar como Auxiliar";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Você recebeu um convite</h2>
      <p>Tipo do convite: <strong>${inviteType}</strong></p>
      <p>Este convite expira em: <strong>${new Date(expiresAt).toLocaleString("pt-BR")}</strong></p>
      <p>
        Clique no link abaixo para finalizar seu cadastro e aceitar:
        <br />
        <a href="${inviteLink}">${inviteLink}</a>
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        status: "failed",
        message: `Falha no envio de email: ${response.status} ${responseText}`,
      };
    }

    return {
      status: "sent",
      message: "Email enviado com sucesso.",
    };
  } catch (error) {
    return {
      status: "failed",
      message: `Falha no envio de email: ${(error as Error).message}`,
    };
  }
}
