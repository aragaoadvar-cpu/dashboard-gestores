import AddUsuarioPageClient from "./AddUsuarioPageClient";
import { requirePlatformManager } from "@/lib/platform-access/server";

export default async function Page() {
  const { nomeAtual } = await requirePlatformManager();
  return <AddUsuarioPageClient nomeUsuario={nomeAtual} />;
}
