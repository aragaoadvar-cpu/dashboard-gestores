import ConvitesFinanceirosClient from "../ConvitesFinanceirosClient";
import { requireAliadoFinanceiroHubAccess } from "@/lib/aliado-financeiro/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const { nomeAtual, hasOwnAliadoModule } = await requireAliadoFinanceiroHubAccess();
  if (!hasOwnAliadoModule) {
    redirect("/aliado-financeiro");
  }
  return <ConvitesFinanceirosClient nomeUsuario={nomeAtual} />;
}
