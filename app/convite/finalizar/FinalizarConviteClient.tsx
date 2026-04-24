"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  token: string;
};

type Etapa = "idle" | "criando" | "aceitando" | "finalizando";

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function FinalizarConviteClient({ token }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function autenticarOuCriarConta(emailNormalizado: string, senhaLimpa: string) {
    const login = await supabase.auth.signInWithPassword({
      email: emailNormalizado,
      password: senhaLimpa,
    });

    if (!login.error) {
      return { success: true as const };
    }

    const cadastro = await supabase.auth.signUp({
      email: emailNormalizado,
      password: senhaLimpa,
    });

    if (cadastro.error) {
      return { success: false as const, error: cadastro.error.message };
    }

    if (cadastro.data.session) {
      return { success: true as const };
    }

    const relogin = await supabase.auth.signInWithPassword({
      email: emailNormalizado,
      password: senhaLimpa,
    });

    if (relogin.error) {
      return {
        success: false as const,
        error:
          "Conta criada, mas não foi possível autenticar automaticamente. Confirme o email e faça login para concluir o convite.",
      };
    }

    return { success: true as const };
  }

  async function finalizarCadastro() {
    if (etapa !== "idle") return;
    setErro("");
    setMensagem("");

    const emailNormalizado = normalizarEmail(email);
    const nomeLimpo = nome.trim();
    const senhaLimpa = senha.trim();

    if (!token) {
      setErro("Token de convite inválido.");
      return;
    }

    if (!emailNormalizado || !nomeLimpo || !senhaLimpa) {
      setErro("Preencha email, nome e senha.");
      return;
    }

    if (senhaLimpa.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setEtapa("criando");
    const authResult = await autenticarOuCriarConta(emailNormalizado, senhaLimpa);
    if (!authResult.success) {
      setEtapa("idle");
      setErro(authResult.error);
      return;
    }

    setEtapa("aceitando");
    const acceptResponse = await fetch("/api/invitations/accept-by-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const acceptPayload = (await acceptResponse.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string }
      | null;

    if (!acceptResponse.ok || !acceptPayload?.success) {
      setEtapa("idle");
      setErro(acceptPayload?.error ?? "Não foi possível aceitar o convite.");
      return;
    }

    setEtapa("finalizando");
    const { error: nomeError } = await supabase.rpc("update_my_profile_name", {
      p_nome: nomeLimpo,
    });

    if (nomeError) {
      setEtapa("idle");
      setErro(`Convite aceito, mas não foi possível salvar seu nome: ${nomeError.message}`);
      return;
    }

    setMensagem("Cadastro concluído com sucesso. Entrando no sistema...");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06080f] p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.18),transparent_35%)]" />

      <section className="relative z-10 w-full max-w-md rounded-[28px] border border-white/15 bg-[#0d1426]/90 p-6 shadow-[0_0_80px_rgba(15,23,42,0.55)] backdrop-blur md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Convite recebido
        </p>

        <h1 className="mt-2 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-2xl font-extrabold text-transparent md:text-3xl">
          Finalizar cadastro
        </h1>

        <p className="mt-2 text-sm text-slate-300">
          Preencha seus dados para aceitar o convite e entrar no sistema.
        </p>

        {!token && (
          <div className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Token de convite não informado.
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
              placeholder="voce@email.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {!!mensagem && (
            <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {mensagem}
            </div>
          )}

          {!!erro && (
            <div className="rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {erro}
            </div>
          )}

          <button
            type="button"
            onClick={finalizarCadastro}
            disabled={etapa !== "idle" || !token}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60"
          >
            {etapa === "idle" && "Finalizar cadastro"}
            {etapa === "criando" && "Criando/entrando na conta..."}
            {etapa === "aceitando" && "Aceitando convite..."}
            {etapa === "finalizando" && "Finalizando perfil..."}
          </button>

          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-cyan-300 underline"
          >
            Voltar para login
          </Link>
        </div>
      </section>
    </main>
  );
}
