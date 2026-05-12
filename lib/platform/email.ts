export type InviteEmailDelivery = {
  status: "sent" | "not_configured" | "failed";
  message: string;
};

async function sendEmail({
  toEmail,
  subject,
  html,
}: {
  toEmail: string;
  subject: string;
  html: string;
}): Promise<InviteEmailDelivery> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVITE_EMAIL_FROM;

  if (!resendApiKey || !fromEmail) {
    return {
      status: "not_configured",
      message:
        "Envio de email não configurado (RESEND_API_KEY / INVITE_EMAIL_FROM ausentes).",
    };
  }

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
      return {
        status: "failed",
        message: `Falha no envio de email: ${response.status} ${await response.text()}`,
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

export async function sendPlatformInviteEmail({
  toEmail,
  inviteLink,
  modules,
}: {
  toEmail: string;
  inviteLink: string;
  modules: string[];
}) {
  return sendEmail({
    toEmail,
    subject: "Convite para acessar o ADSYNC3",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Você recebeu um convite para o ADSYNC3</h2>
        <p>Módulos liberados:</p>
        <ul>${modules.map((item) => `<li>${item}</li>`).join("")}</ul>
        <p>Use o link abaixo para criar sua conta ou entrar no sistema:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    `,
  });
}

export async function sendFinanceShareInviteEmail({
  toEmail,
  inviteLink,
  permissionLabel,
}: {
  toEmail: string;
  inviteLink: string;
  permissionLabel: string;
}) {
  return sendEmail({
    toEmail,
    subject: "Convite para compartilhar finanças no ADSYNC3",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Você recebeu um compartilhamento financeiro</h2>
        <p>Permissão liberada: <strong>${permissionLabel}</strong></p>
        <p>Use o link abaixo para criar sua conta ou entrar no sistema:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    `,
  });
}
