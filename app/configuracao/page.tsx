import ConfiguracaoPageClient from "./ConfiguracaoPageClient";
import { getPlatformAccessContext } from "@/lib/platform-access/server";

export default async function Page() {
  const { roleUsuario, nomeAtual, email } = await getPlatformAccessContext();

  return (
    <ConfiguracaoPageClient
      nomeInicial={nomeAtual}
      emailAtual={email}
      roleAtual={roleUsuario ?? "gestor"}
    />
  );
}
