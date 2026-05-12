import OperacaoPage from "./_OperacaoPageBase";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";

export default async function Page() {
  await requireDashboardModuleAccess();
  return <OperacaoPage />;
}
