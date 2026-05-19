export type RoleUsuario =
  | "dono"
  | "admin"
  | "gestor_admin"
  | "gestor"
  | "auxiliar"
  | null;

export function parseRole(value: string | null | undefined): RoleUsuario {
  if (
    value === "dono" ||
    value === "admin" ||
    value === "gestor_admin" ||
    value === "gestor" ||
    value === "auxiliar"
  ) {
    return value;
  }

  return null;
}

export function isOperationalAdminRole(role: RoleUsuario): boolean {
  return role === "admin" || role === "gestor_admin";
}
