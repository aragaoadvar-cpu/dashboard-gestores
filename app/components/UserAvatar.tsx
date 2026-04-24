type Props = {
  nome?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function getInitials(nome?: string | null, email?: string | null) {
  const nomeLimpo = (nome || "").trim();
  if (nomeLimpo) {
    const partes = nomeLimpo.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return `${partes[0][0] ?? ""}${partes[1][0] ?? ""}`.toUpperCase();
  }

  const emailLimpo = (email || "").trim();
  if (emailLimpo) return emailLimpo.slice(0, 2).toUpperCase();
  return "??";
}

function getSizeClasses(size: "sm" | "md" | "lg") {
  if (size === "sm") return "h-8 w-8 text-xs";
  if (size === "lg") return "h-14 w-14 text-base";
  return "h-10 w-10 text-sm";
}

export default function UserAvatar({
  nome,
  email,
  size = "md",
  className = "",
}: Props) {
  const sizeClasses = getSizeClasses(size);
  const initials = getInitials(nome, email);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-cyan-500/30 to-indigo-500/35 font-extrabold text-cyan-100 ${sizeClasses} ${className}`}
      aria-label={nome?.trim() || email?.trim() || "Avatar"}
      title={nome?.trim() || email?.trim() || "Avatar"}
    >
      {initials}
    </div>
  );
}
