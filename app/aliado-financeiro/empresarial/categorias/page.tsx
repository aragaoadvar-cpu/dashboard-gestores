import { requireAliadoFinanceiroUser } from "@/lib/aliado-financeiro/server";
import CategoriasFinanceirasClient from "@/app/aliado-financeiro/CategoriasFinanceirasClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await requireAliadoFinanceiroUser(await searchParams, "empresarial");
  return (
    <CategoriasFinanceirasClient
      ownerUserId={access.ownerUserId}
      ownerNome={access.ownerNome}
      canEdit={access.canEdit}
      isSharedView={access.isSharedView}
      escopo="empresarial"
    />
  );
}
