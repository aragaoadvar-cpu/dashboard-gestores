import DespesasPageClient from "./DespesasPageClient";
import { requireDashboardModuleAccess } from "@/lib/platform-access/server";

export default async function Page() {
  await requireDashboardModuleAccess();
  return <DespesasPageClient />;
}
