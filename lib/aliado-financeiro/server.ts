import { redirect } from "next/navigation";
import { getPlatformAccessContext } from "@/lib/platform-access/server";
import { getPlatformServiceSupabaseClient } from "@/lib/platform-access/service";
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

export type FinanceiroSharedHubItem = {
  owner_user_id: string;
  owner_nome: string;
  permission_level: "view" | "edit";
  escopos: FinanceiroEscopo[];
};

async function resolveOwnerDisplayNames(params: {
  supabase: Awaited<ReturnType<typeof getPlatformAccessContext>>["supabase"];
  ownerIds: string[];
}) {
  const { supabase, ownerIds } = params;
  const ownerNames = new Map<string, string>();
  const serviceSupabase = getPlatformServiceSupabaseClient();

  if (ownerIds.length === 0) {
    return ownerNames;
  }

  if (serviceSupabase) {
    const { data: profilesData, error: profilesError } = await serviceSupabase
      .from("profiles")
      .select("id, nome")
      .in("id", ownerIds);

    if (!profilesError) {
      for (const item of profilesData ?? []) {
        const nome = item.nome?.trim();
        if (nome) {
          ownerNames.set(item.id, nome);
        }
      }
    }

    const unresolvedOwnerIds = ownerIds.filter((ownerId) => !ownerNames.has(ownerId));
    if (unresolvedOwnerIds.length > 0) {
      const authUsers = await Promise.all(
        unresolvedOwnerIds.map(async (ownerId) => {
          const { data, error } = await serviceSupabase.auth.admin.getUserById(ownerId);
          if (error) {
            return [ownerId, ""] as const;
          }

          return [ownerId, data.user?.email?.trim().toLowerCase() ?? ""] as const;
        })
      );

      for (const [ownerId, email] of authUsers) {
        if (email) {
          ownerNames.set(ownerId, email);
        }
      }
    }

    return ownerNames;
  }

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, nome")
    .in("id", ownerIds);

  for (const item of profilesData ?? []) {
    const nome = item.nome?.trim();
    if (nome) {
      ownerNames.set(item.id, nome);
    }
  }

  return ownerNames;
}

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

  const { data: sharedData, error: sharedError } = await context.supabase
    .from("financeiro_shared_access")
    .select("owner_user_id, permission_level, escopos")
    .eq("shared_user_id", context.userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  if (sharedError) {
    throw new Error(`Erro ao carregar compartilhamentos do Aliado: ${sharedError.message}`);
  }

  const ownerIds = Array.from(
    new Set((sharedData ?? []).map((item) => item.owner_user_id).filter(Boolean))
  );

  const ownerNames = await resolveOwnerDisplayNames({
    supabase: context.supabase,
    ownerIds,
  });

  const sharedHubItems: FinanceiroSharedHubItem[] = (sharedData ?? []).map((item) => ({
    owner_user_id: item.owner_user_id,
    owner_nome: ownerNames.get(item.owner_user_id) ?? "Usuário sem nome",
    permission_level: item.permission_level === "edit" ? "edit" : "view",
    escopos: ((item.escopos ?? []) as string[]).filter(
      (scope): scope is FinanceiroEscopo => scope === "pessoal" || scope === "empresarial"
    ),
  }));

  return {
    ...context,
    sharedHubItems,
  };
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

  const ownerNames = await resolveOwnerDisplayNames({
    supabase: context.supabase,
    ownerIds: [ownerUserIdParam],
  });

  return {
    authUserId: context.userId,
    ownerUserId: ownerUserIdParam,
    ownerNome: ownerNames.get(ownerUserIdParam) ?? "Usuário sem nome",
    nomeAtual: context.nomeAtual,
    canEdit: shareData.permission_level === "edit",
    isSharedView: true,
    permissionLevel: shareData.permission_level === "edit" ? "edit" : "view",
    canAccessOwnAliado: context.hasOwnAliadoModule,
    scope,
    allowedScopes,
  };
}
