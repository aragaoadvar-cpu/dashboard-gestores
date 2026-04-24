import FinalizarConviteClient from "./FinalizarConviteClient";

type SearchParams = Promise<{
  token?: string | string[];
}>;

function getTokenFromSearchParam(value: string | string[] | undefined) {
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
  const token = getTokenFromSearchParam(params.token).trim();

  return <FinalizarConviteClient token={token} />;
}

