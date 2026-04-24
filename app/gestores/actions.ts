"use server";

import {
  saveAdminGestorTaxas,
  type SaveAdminGestorTaxasInput,
  type SaveAdminGestorTaxasResult,
} from "@/lib/admin-gestor-taxas/saveAdminGestorTaxas";

export async function salvarTaxasAdministrativasGestor(
  input: SaveAdminGestorTaxasInput
): Promise<SaveAdminGestorTaxasResult> {
  return saveAdminGestorTaxas(input);
}
