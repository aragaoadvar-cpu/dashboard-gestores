import OperacoesPageClient from "./OperacoesPageClient";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";

export default async function Page() {
  await requireDashboardModuleAccess();
  return <OperacoesPageClient />;
}
