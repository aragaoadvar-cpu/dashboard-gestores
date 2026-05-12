"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ContaDesativadaClient() {
  const router = useRouter();
  const supabase = createClient();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    if (saindo) return;

    setSaindo(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06080f] p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.14),transparent_35%)]" />

      <section className="relative z-10 w-full max-w-xl rounded-[28px] border border-white/15 bg-[#0d1426]/90 p-6 text-center shadow-[0_0_80px_rgba(15,23,42,0.55)] backdrop-blur md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/80">
          Acesso bloqueado
        </p>
        <h1 className="mt-3 text-2xl font-extrabold text-white md:text-4xl">
          Conta desativada
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
          Sua conta está desativada. Entre em contato com o administrador.
        </p>

        <button
          type="button"
          onClick={() => void sair()}
          disabled={saindo}
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110 disabled:opacity-60"
        >
          {saindo ? "Saindo..." : "Sair"}
        </button>
      </section>
    </main>
  );
}
