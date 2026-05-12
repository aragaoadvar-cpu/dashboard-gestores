import { redirect } from "next/navigation";
import { getPlatformAccessContext } from "@/lib/platform-access/server";
import type { FinanceiroEscopo } from "./types";

type FinanceiroShareSearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | null
  | undefined;

export type FinanceiroResolvedAccess = {
  authUserId: string;
  ownerUserId: string;
  ownerNome: string;
  nomeAtual: string;
  canEdit: boolean;
  isSharedView: boolean;
  permissionLevel: "owner" | "view" | "edit";
  canAccessOwnAliado: boolean;
  scope: FinanceiroEscopo;
  allowedScopes: FinanceiroEscopo[];
};

function getSearchValue(
  searchParams: FinanceiroShareSearchParams,
  key: string
) {
  if (!searchParams) return "";
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key)?.trim() ?? "";
  }
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export function getEscopoFromSearchParams(
  searchParams?: FinanceiroShareSearchParams,
  fallback: FinanceiroEscopo = "pessoal"
) {
  const escopo = getSearchValue(searchParams, "escopo");
  return escopo === "empresarial" || escopo === "pessoal" ? escopo : fallback;
}

export async function requireAliadoFinanceiroHubAccess() {
  const context = await getPlatformAccessContext();

  if (!context.canAccessAliado) {
    redirect("/inicio");
  }

  return context;
}

export async function requireAliadoFinanceiroUser(
  searchParams: FinanceiroShareSearchParams | undefined,
  scope: FinanceiroEscopo
): Promise<FinanceiroResolvedAccess> {
  const context = await requireAliadoFinanceiroHubAccess();
  const ownerUserIdParam = getSearchValue(searchParams, "owner");
  const canAccessOwnScope =
    scope === "empresarial"
      ? context.hasOwnAliadoEmpresarialModule
      : context.hasOwnAliadoPessoalModule;

  if (!ownerUserIdParam || ownerUserIdParam === context.userId) {
    if (!canAccessOwnScope) {
      redirect("/aliado-financeiro");
    }

    return {
      authUserId: context.userId,
      ownerUserId: context.userId,
      ownerNome: context.nomeAtual,
      nomeAtual: context.nomeAtual,
      canEdit: true,
      isSharedView: false,
      permissionLevel: "owner",
      canAccessOwnAliado: context.hasOwnAliadoModule,
      scope,
      allowedScopes: ["pessoal", "empresarial"],
    };
  }

  const { data: shareData, error: shareError } = await context.supabase
    .from("financeiro_shared_access")
    .select("owner_user_id, permission_level, status, escopos")
    .eq("owner_user_id", ownerUserIdParam)
    .eq("shared_user_id", context.userId)
    .eq("status", "accepted")
    .maybeSingle();

  const allowedScopes = ((shareData?.escopos ?? []) as string[]).filter(
    (item): item is FinanceiroEscopo => item === "pessoal" || item === "empresarial"
  );

  if (shareError || !shareData || !allowedScopes.includes(scope)) {
    redirect("/aliado-financeiro");
  }

  const { data: ownerProfile } = await context.supabase
    .from("profiles")
    .select("nome")
    .eq("id", ownerUserIdParam)
    .maybeSingle();

  return {
    authUserId: context.userId,
    ownerUserId: ownerUserIdParam,
    ownerNome: ownerProfile?.nome?.trim() || "outro usuário",
    nomeAtual: context.nomeAtual,
    canEdit: shareData.permission_level === "edit",
    isSharedView: true,
    permissionLevel: shareData.permission_level === "edit" ? "edit" : "view",
    canAccessOwnAliado: context.hasOwnAliadoModule,
    scope,
    allowedScopes,
  };
}
