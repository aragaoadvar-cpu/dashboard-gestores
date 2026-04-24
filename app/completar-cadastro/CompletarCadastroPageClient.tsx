"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function CompletarCadastroPageClient() {
  const supabase = createClient();
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvarNome() {
    setErro("");

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro("Digite seu nome para continuar.");
      return;
    }

    setSalvando(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErro("Usuário não autenticado.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.rpc("update_my_profile_name", {
      p_nome: nomeLimpo,
    });

    if (error) {
      setErro(`Erro ao salvar nome: ${error.message}`);
      setSalvando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] p-4 md:p-6">
      <section className="mx-auto mt-10 max-w-md rounded-[28px] card-white-modern p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          Primeiro acesso
        </p>

        <h1 className="mt-2 text-2xl font-extrabold text-black md:text-3xl">
          Complete seu cadastro
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Precisamos do seu nome para finalizar sua configuração.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-black"
              placeholder="Seu nome completo"
            />
          </div>

          {!!erro && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          <button
            type="button"
            onClick={salvarNome}
            disabled={salvando}
            className="w-full rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar e continuar"}
          </button>
        </div>
      </section>
    </main>
  );
}
