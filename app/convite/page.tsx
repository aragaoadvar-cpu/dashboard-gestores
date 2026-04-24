import Link from "next/link";
import { redirect } from "next/navigation";
import { hashInviteToken } from "@/lib/invitations/token";
import { createClient } from "@/lib/supabase/server";

type ConviteSearchParams = Promise<{
  token?: string | string[];
}>;

type AcceptResult = {
  success?: boolean;
  code?: string;
  message?: string;
  invite_type?: "admin" | "gestor" | "auxiliar";
};

function getTokenFromSearchParam(value: string | string[] | undefined) {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
}

export default async function ConvitePage({
  searchParams,
}: {
  searchParams: ConviteSearchParams;
}) {
  const params = await searchParams;
  const token = getTokenFromSearchParam(params.token).trim();

  if (!token) {
    return (
      <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 card-white-modern p-6">
        <h1 className="text-xl font-bold text-black">Convite inválido</h1>
        <p className="mt-2 text-sm text-gray-600">Token de convite não informado.</p>
        <Link className="mt-4 inline-block text-sm font-semibold text-black underline" href="/login">
          Ir para login
        </Link>
      </section>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const tokenHash = hashInviteToken(token);

  const { data, error } = await supabase.rpc("accept_invitation_by_token_hash", {
    p_token_hash: tokenHash,
  });

  let result: AcceptResult;
  if (error) {
    result = {
      success: false,
      code: "rpc_error",
      message: `Erro ao aceitar convite: ${error.message}`,
    };
  } else {
    result = (data as AcceptResult) ?? {
      success: false,
      code: "unknown_error",
      message: "Erro ao processar convite.",
    };
  }

  if (result.success) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .single();

    if (!profileError) {
      const nomeAtual = profileData?.nome?.trim() ?? "";
      redirect(nomeAtual ? "/" : "/completar-cadastro");
    }

    redirect("/completar-cadastro");
  }

  return (
    <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 card-white-modern p-6">
      <h1 className="text-xl font-bold text-black">Não foi possível aceitar o convite</h1>
      <p className="mt-2 text-sm text-gray-600">{result.message ?? "Convite inválido."}</p>
      <Link className="mt-4 inline-block text-sm font-semibold text-black underline" href="/">
        Voltar para dashboard
      </Link>
    </section>
  );
}
