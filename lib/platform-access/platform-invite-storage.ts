const PLATFORM_INVITE_STORAGE_KEY = "platform_invite_pending_v1";

export type PendingPlatformInvite = {
  token: string;
  email: string;
  nome: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function savePendingPlatformInvite(invite: PendingPlatformInvite) {
  if (!isBrowser()) return;

  const payload = {
    token: invite.token.trim(),
    email: normalizeEmail(invite.email),
    nome: invite.nome.trim(),
  };

  window.localStorage.setItem(PLATFORM_INVITE_STORAGE_KEY, JSON.stringify(payload));
}

export function getPendingPlatformInvite(): PendingPlatformInvite | null {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(PLATFORM_INVITE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingPlatformInvite>;
    const token = parsed.token?.trim() ?? "";
    const email = normalizeEmail(parsed.email ?? "");
    const nome = parsed.nome?.trim() ?? "";

    if (!token || !email || !nome) {
      clearPendingPlatformInvite();
      return null;
    }

    return { token, email, nome };
  } catch {
    clearPendingPlatformInvite();
    return null;
  }
}

export function clearPendingPlatformInvite() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(PLATFORM_INVITE_STORAGE_KEY);
}
