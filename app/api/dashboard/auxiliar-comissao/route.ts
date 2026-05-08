import { getComissaoAuxiliar } from "@/lib/comissao/getComissaoAuxiliar";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    return Response.json(
      { success: false, error: "Não foi possível carregar o perfil do usuário." },
      { status: 500 }
    );
  }

  if (profileData.role !== "auxiliar") {
    return Response.json(
      { success: true, temConfiguracao: false, comissaoAtual: null },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const mes = Number(searchParams.get("mes"));
  const ano = Number(searchParams.get("ano"));

  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2000) {
    return Response.json(
      { success: false, error: "Mês e ano inválidos para cálculo da comissão." },
      { status: 400 }
    );
  }

  try {
    const comissao = await getComissaoAuxiliar(user.id, mes, ano);

    return Response.json(
      {
        success: true,
        temConfiguracao: comissao?.temConfiguracao ?? false,
        comissaoAtual: comissao?.comissaoAtual ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível calcular a comissão do auxiliar.",
      },
      { status: 500 }
    );
  }
}
