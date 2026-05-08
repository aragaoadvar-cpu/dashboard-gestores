type ResponsiveMetricValueSize = "hero" | "card" | "compact";

type Props = {
  value: string;
  className?: string;
  size?: ResponsiveMetricValueSize;
};

function getSizeClass(length: number, size: ResponsiveMetricValueSize) {
  if (size === "hero") {
    return "text-[clamp(1.2rem,1.4vw,1.75rem)]";
  }

  if (size === "compact") {
    if (length >= 16) {
      return "text-[clamp(0.72rem,2.1vw,0.82rem)] sm:text-[clamp(0.78rem,1.8vw,0.92rem)] md:text-[clamp(0.82rem,1.4vw,1rem)]";
    }
    if (length >= 12) {
      return "text-[clamp(0.78rem,2.25vw,0.9rem)] sm:text-[clamp(0.84rem,1.95vw,1rem)] md:text-[clamp(0.9rem,1.5vw,1.05rem)]";
    }
    return "text-[clamp(0.85rem,2.4vw,1rem)] sm:text-[clamp(0.9rem,2vw,1.05rem)] md:text-[clamp(0.95rem,1.6vw,1.1rem)]";
  }

  if (length >= 18) {
    return "text-[clamp(0.85rem,2.8vw,1.05rem)] sm:text-[clamp(0.95rem,2.3vw,1.2rem)] md:text-[clamp(1rem,1.8vw,1.45rem)]";
  }
  if (length >= 14) {
    return "text-[clamp(0.92rem,3vw,1.15rem)] sm:text-[clamp(1rem,2.4vw,1.35rem)] md:text-[clamp(1.05rem,1.9vw,1.65rem)]";
  }
  return "text-[clamp(1rem,3.2vw,1.3rem)] sm:text-[clamp(1.05rem,2.5vw,1.5rem)] md:text-[clamp(1.15rem,2vw,1.85rem)]";
}

export default function ResponsiveMetricValue({
  value,
  className = "",
  size = "card",
}: Props) {
  const normalizedLength = value.replace(/\s+/g, "").length;
  const sizeClass = getSizeClass(normalizedLength, size);

  return (
    <p
      className={`block w-full min-w-0 max-w-full whitespace-nowrap tabular-nums tracking-tight leading-tight ${sizeClass} ${className}`.trim()}
      title={value}
    >
      {value}
    </p>
  );
}
