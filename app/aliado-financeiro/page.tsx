import { requireAliadoFinanceiroHubAccess } from "@/lib/aliado-financeiro/server";
import AliadoFinanceiroHomeClient from "./AliadoFinanceiroHomeClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams: _searchParams,
}: {
  searchParams: SearchParams;
}) {
  void _searchParams;
  const access = await requireAliadoFinanceiroHubAccess();
  return (
    <AliadoFinanceiroHomeClient
      authUserId={access.userId}
      nomeUsuario={access.nomeAtual}
      hasOwnAliadoModule={access.hasOwnAliadoModule}
      hasOwnAliadoPessoalModule={access.hasOwnAliadoPessoalModule}
      hasOwnAliadoEmpresarialModule={access.hasOwnAliadoEmpresarialModule}
    />
  );
}
