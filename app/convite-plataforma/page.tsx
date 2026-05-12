import FinalizarConvitePlataformaClient from "./FinalizarConvitePlataformaClient";

type SearchParams = Promise<{
  token?: string | string[];
}>;

function getToken(value: string | string[] | undefined) {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = getToken(params.token).trim();
  return <FinalizarConvitePlataformaClient token={token} />;
}
