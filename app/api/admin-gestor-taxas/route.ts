import {
  saveAdminGestorTaxas,
  type SaveAdminGestorTaxasInput,
} from "@/lib/admin-gestor-taxas/saveAdminGestorTaxas";

export async function POST(request: Request) {
  let body: SaveAdminGestorTaxasInput;

  try {
    body = (await request.json()) as SaveAdminGestorTaxasInput;
  } catch {
    return Response.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const result = await saveAdminGestorTaxas(body);

  if (!result.success) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }

  return Response.json(result, { status: 200 });
}
