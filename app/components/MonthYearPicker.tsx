"use client";

import { useEffect, useMemo, useState } from "react";
import { MESES, formatarMesAnoCurto, listarPeriodosDisponiveis } from "../../lib/periodo";

type Variant = "dark" | "light";
type Align = "left" | "center" | "right";

type Props = {
  mes: number;
  ano: number;
  onChange: (mes: number, ano: number) => void;
  variant?: Variant;
  align?: Align;
  className?: string;
};

const VARIANT_CLASSES: Record<
  Variant,
  {
    button: string;
    panel: string;
    helper: string;
    yearActive: string;
    yearIdle: string;
    monthActive: string;
    monthIdle: string;
  }
> = {
  dark: {
    button:
      "border-white/20 bg-[#0b1222] text-slate-100 hover:bg-white/10",
    panel:
      "border-white/15 bg-[#0b1222] text-slate-100 shadow-xl",
    helper: "text-slate-400",
    yearActive: "border-cyan-300 bg-cyan-500/20 text-cyan-100",
    yearIdle: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    monthActive: "bg-cyan-500 text-white border-cyan-300",
    monthIdle: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
  },
  light: {
    button:
      "border-gray-300 bg-white text-black hover:bg-gray-50",
    panel:
      "border-gray-200 bg-white text-slate-900 shadow-xl",
    helper: "text-slate-500",
    yearActive: "border-black bg-black text-white",
    yearIdle: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
    monthActive: "border-black bg-black text-white",
    monthIdle: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  },
};

function getAlignClass(align: Align) {
  if (align === "center") return "left-1/2 -translate-x-1/2";
  if (align === "right") return "right-0";
  return "left-0";
}

export default function MonthYearPicker({
  mes,
  ano,
  onChange,
  variant = "dark",
  align = "left",
  className = "",
}: Props) {
  const hoje = useMemo(() => new Date(), []);
  const periodos = useMemo(() => listarPeriodosDisponiveis(hoje), [hoje]);
  const anosDisponiveis = useMemo(
    () => Array.from(new Set(periodos.map((item) => item.ano))),
    [periodos]
  );
  const [aberto, setAberto] = useState(false);
  const [anoEmFoco, setAnoEmFoco] = useState(ano);

  useEffect(() => {
    setAnoEmFoco(ano);
  }, [ano]);

  const classes = VARIANT_CLASSES[variant];
  const mesesDoAno = MESES.map((item) => ({
    ...item,
    selecionado: item.valor === mes && anoEmFoco === ano,
  }));

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        className={`min-h-[44px] w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition md:w-auto md:px-5 md:text-base ${classes.button}`}
      >
        Período: {formatarMesAnoCurto(mes, ano)}
      </button>

      {aberto && (
        <div
          className={`absolute top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border p-4 ${getAlignClass(
            align
          )} ${classes.panel}`}
        >
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${classes.helper}`}>
            1. Escolha o ano
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {anosDisponiveis.map((anoItem) => (
              <button
                key={anoItem}
                type="button"
                onClick={() => setAnoEmFoco(anoItem)}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  anoItem === anoEmFoco ? classes.yearActive : classes.yearIdle
                }`}
              >
                {anoItem}
              </button>
            ))}
          </div>

          <p className={`mt-5 text-xs font-semibold uppercase tracking-[0.18em] ${classes.helper}`}>
            2. Escolha o mês
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {mesesDoAno.map((mesItem) => (
              <button
                key={mesItem.valor}
                type="button"
                onClick={() => {
                  onChange(mesItem.valor, anoEmFoco);
                  setAberto(false);
                }}
                className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  mesItem.selecionado ? classes.monthActive : classes.monthIdle
                }`}
              >
                {mesItem.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
