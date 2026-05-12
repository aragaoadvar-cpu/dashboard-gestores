import { redirect } from "next/navigation";
import { buildHrefComPeriodo } from "@/lib/periodo";
import { getEscopoFromSearchParams } from "@/lib/aliado-financeiro/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const escopo = getEscopoFromSearchParams(resolvedSearchParams);
  const pathname =
    escopo === "empresarial"
      ? "/aliado-financeiro/empresarial/relatorios"
      : "/aliado-financeiro/pessoal/relatorios";

  redirect(
    buildHrefComPeriodo(
      pathname,
      {
        mes: getSingleValue(resolvedSearchParams.mes),
        ano: getSingleValue(resolvedSearchParams.ano),
        modo: getSingleValue(resolvedSearchParams.modo),
        inicio: getSingleValue(resolvedSearchParams.inicio),
        fim: getSingleValue(resolvedSearchParams.fim),
      },
      {
        owner: getSingleValue(resolvedSearchParams.owner),
      }
    )
  );
}
