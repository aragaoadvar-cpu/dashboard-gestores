import "server-only";

import { createClient } from "@/lib/supabase/server";

type NullableNumberInput = number | string | null | undefined;

export type SaveAdminGestorTaxasInput = {
  gestor_user_id: string;
  taxa_facebook_admin?: NullableNumberInput;
  taxa_network_admin?: NullableNumberInput;
  taxa_imposto_admin?: NullableNumberInput;
  cotacao_dolar_admin?: NullableNumberInput;
  repasse_percentual_admin?: NullableNumberInput;
};

type SaveAdminGestorTaxasData = {
  id: string;
  admin_user_id: string;
  gestor_user_id: string;
  taxa_facebook_admin: number | null;
  taxa_network_admin: number | null;
  taxa_imposto_admin: number | null;
  cotacao_dolar_admin: number | null;
  repasse_percentual_admin: number | null;
  created_at: string;
  updated_at: string;
};

export type SaveAdminGestorTaxasResult =
  | {
      success: true;
      data: SaveAdminGestorTaxasData;
      message: string;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseNullableNumber(value: NullableNumberInput, fieldName: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Campo inválido: ${fieldName}.`);
  }

  return parsed;
}

export async function saveAdminGestorTaxas(
  input: SaveAdminGestorTaxasInput
): Promise<SaveAdminGestorTaxasResult> {
  const gestorUserId = (input.gestor_user_id || "").trim();

  if (!UUID_REGEX.test(gestorUserId)) {
    return {
      success: false,
      error: "gestor_user_id inválido.",
      status: 400,
    };
  }

  let taxaFacebookAdmin: number | null;
  let taxaNetworkAdmin: number | null;
  let taxaImpostoAdmin: number | null;
  let cotacaoDolarAdmin: number | null;
  let repassePercentualAdmin: number | null;

  try {
    taxaFacebookAdmin = parseNullableNumber(input.taxa_facebook_admin, "taxa_facebook_admin");
    taxaNetworkAdmin = parseNullableNumber(input.taxa_network_admin, "taxa_network_admin");
    taxaImpostoAdmin = parseNullableNumber(input.taxa_imposto_admin, "taxa_imposto_admin");
    cotacaoDolarAdmin = parseNullableNumber(input.cotacao_dolar_admin, "cotacao_dolar_admin");
    repassePercentualAdmin = parseNullableNumber(
      input.repasse_percentual_admin,
      "repasse_percentual_admin"
    );
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      status: 400,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Usuário não autenticado.",
      status: 401,
    };
  }

  const { data: isAdmin, error: isAdminError } = await supabase.rpc("is_admin", {
    check_user_id: user.id,
  });

  if (isAdminError) {
    return {
      success: false,
      error: `Erro ao validar papel do usuário: ${isAdminError.message}`,
      status: 500,
    };
  }

  if (!isAdmin) {
    return {
      success: false,
      error: "Apenas administradores podem salvar taxas administrativas por gestor.",
      status: 403,
    };
  }

  const { data: canManageGestor, error: canManageGestorError } = await supabase.rpc(
    "is_admin_of_gestor",
    {
      check_admin_id: user.id,
      check_gestor_id: gestorUserId,
    }
  );

  if (canManageGestorError) {
    return {
      success: false,
      error: `Erro ao validar vínculo admin/gestor: ${canManageGestorError.message}`,
      status: 500,
    };
  }

  if (!canManageGestor) {
    return {
      success: false,
      error: "Você só pode salvar taxas para gestores ativos vinculados à sua equipe.",
      status: 403,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: upsertData, error: upsertError } = await supabase
    .from("admin_gestor_taxas")
    .upsert(
      {
        admin_user_id: user.id,
        gestor_user_id: gestorUserId,
        taxa_facebook_admin: taxaFacebookAdmin,
        taxa_network_admin: taxaNetworkAdmin,
        taxa_imposto_admin: taxaImpostoAdmin,
        cotacao_dolar_admin: cotacaoDolarAdmin,
        repasse_percentual_admin: repassePercentualAdmin,
        updated_at: nowIso,
      },
      { onConflict: "admin_user_id,gestor_user_id" }
    )
    .select(
      "id, admin_user_id, gestor_user_id, taxa_facebook_admin, taxa_network_admin, taxa_imposto_admin, cotacao_dolar_admin, repasse_percentual_admin, created_at, updated_at"
    )
    .single();

  if (upsertError || !upsertData) {
    return {
      success: false,
      error: `Erro ao salvar taxas administrativas: ${upsertError?.message ?? "Falha desconhecida."}`,
      status: 500,
    };
  }

  return {
    success: true,
    data: upsertData as SaveAdminGestorTaxasData,
    message: "Taxas administrativas salvas com sucesso.",
  };
}
