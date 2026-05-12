export type StoredModuleKey =
  | "dashboard_ads"
  | "aliado_financeiro"
  | "aliado_financeiro_pessoal"
  | "aliado_financeiro_empresarial";

export type ManageableModuleKey =
  | "dashboard_ads"
  | "aliado_financeiro_pessoal"
  | "aliado_financeiro_empresarial";

export type ModulePermissionsView = Record<ManageableModuleKey, boolean>;

export function isStoredModuleKey(value: unknown): value is StoredModuleKey {
  return (
    value === "dashboard_ads" ||
    value === "aliado_financeiro" ||
    value === "aliado_financeiro_pessoal" ||
    value === "aliado_financeiro_empresarial"
  );
}

export function isManageableModuleKey(value: unknown): value is ManageableModuleKey {
  return (
    value === "dashboard_ads" ||
    value === "aliado_financeiro_pessoal" ||
    value === "aliado_financeiro_empresarial"
  );
}

export function resolveModulePermissions(
  permissions: Array<{ module_key: StoredModuleKey; enabled: boolean }>
): ModulePermissionsView {
  const hasLegacyAliado = permissions.some(
    (item) => item.module_key === "aliado_financeiro" && item.enabled
  );

  return {
    dashboard_ads: permissions.some(
      (item) => item.module_key === "dashboard_ads" && item.enabled
    ),
    aliado_financeiro_pessoal:
      hasLegacyAliado ||
      permissions.some(
        (item) => item.module_key === "aliado_financeiro_pessoal" && item.enabled
      ),
    aliado_financeiro_empresarial:
      hasLegacyAliado ||
      permissions.some(
        (item) => item.module_key === "aliado_financeiro_empresarial" && item.enabled
      ),
  };
}

export function hasAnyOwnAliadoScope(modules: ModulePermissionsView) {
  return (
    modules.aliado_financeiro_pessoal || modules.aliado_financeiro_empresarial
  );
}
