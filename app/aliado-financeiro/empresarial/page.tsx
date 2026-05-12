import { requireAliadoFinanceiroUser } from "@/lib/aliado-financeiro/server";
import AliadoFinanceiroDashboardClient from "../AliadoFinanceiroDashboardClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await requireAliadoFinanceiroUser(await searchParams, "empresarial");
  return (
    <AliadoFinanceiroDashboardClient
      nomeUsuario={access.nomeAtual}
      ownerUserId={access.ownerUserId}
      ownerNome={access.ownerNome}
      canEdit={access.canEdit}
      isSharedView={access.isSharedView}
      escopo="empresarial"
    />
  );
}
