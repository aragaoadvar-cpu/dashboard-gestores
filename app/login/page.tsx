"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

type AcceptResult = {
  success?: boolean;
  code?: string;
  message?: string;
  invite_type?: "admin" | "gestor" | "auxiliar";
};

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function aceitarConvitePendenteAposLogin(userId: string, userEmail: string) {
    const emailNormalizado = userEmail.trim().toLowerCase();
    if (!emailNormalizado) return { success: true as const };

    const { data: invite, error: inviteError } = await supabase
      .from("user_invitations")
      .select("token_hash, invite_type")
      .eq("normalized_email", emailNormalizado)
      .eq("status", "pending")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      return {
        success: false as const,
        error: `Erro ao localizar convite pendente: ${inviteError.message}`,
      };
    }

    if (!invite?.token_hash) {
      return { success: true as const };
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("accept_invitation_by_token_hash", {
      p_token_hash: invite.token_hash,
    });

    if (rpcError) {
      return {
        success: false as const,
        error: `Erro ao aceitar convite pendente: ${rpcError.message}`,
      };
    }

    const result = (rpcData as AcceptResult) ?? {
      success: false,
      code: "unknown_error",
      message: "Erro ao processar aceite do convite.",
    };

    if (!result.success) {
      return {
        success: false as const,
        error: result.message ?? "Nao foi possivel aceitar o convite pendente.",
      };
    }

    const { data: profileAtualizado, error: profileAtualizadoError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileAtualizadoError) {
      return {
        success: false as const,
        error: `Convite aceito, mas nao foi possivel confirmar o perfil atualizado: ${profileAtualizadoError.message}`,
      };
    }

    if (!profileAtualizado?.role) {
      return {
        success: false as const,
        error: "Convite aceito, mas o perfil nao foi encontrado apos o aceite.",
      };
    }

    return { success: true as const };
  }

  async function entrarOuCadastrar() {
    if (carregando) return;

    setCarregando(true);
    setMensagem("");
    setErro("");

    try {
      if (!email || !senha) {
        setErro("Preencha email e senha.");
        return;
      }

      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });

        if (error) {
          setErro(error.message);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setErro("Nao foi possivel identificar o usuario apos login.");
          return;
        }

        if (user.email) {
          const aceitePendente = await aceitarConvitePendenteAposLogin(user.id, user.email);
          if (!aceitePendente.success) {
            setErro(aceitePendente.error);
            return;
          }
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", user.id)
          .single();

        if (profileError) {
          setErro(`Erro ao carregar perfil: ${profileError.message}`);
          return;
        }

        const nomeAtual = profileData?.nome?.trim() ?? "";
        router.push(nomeAtual ? "/inicio" : "/completar-cadastro");
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
      });

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(
        "Cadastro realizado. Se o projeto exigir confirmacao por email, confirme antes de entrar."
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao autenticar. Tente novamente.";
      setErro(message);
    } finally {
      setCarregando(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void entrarOuCadastrar();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04070d] px-4 py-6 md:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_20%_80%,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_85%_25%,rgba(99,102,241,0.16),transparent_26%),linear-gradient(160deg,rgba(4,7,13,0.98),rgba(9,12,24,0.96),rgba(3,5,12,1))]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.85)_0.7px,transparent_0.9px)] [background-size:26px_26px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[780px] w-[780px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[980px] w-[980px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-300/8" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-[340px] w-[340px] rounded-full bg-cyan-400/12 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-12%] top-[18%] h-[320px] w-[320px] rounded-full bg-indigo-500/14 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-14%] left-[12%] h-[260px] w-[460px] rounded-full bg-sky-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[-18%] h-[340px] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.14),transparent_62%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[2px] w-[620px] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent lg:block" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[620px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-indigo-200/20 to-transparent lg:block" />
      <div className="pointer-events-none absolute left-[18%] top-[24%] hidden h-px w-[18%] rotate-[18deg] bg-gradient-to-r from-transparent via-cyan-200/28 to-transparent lg:block" />
      <div className="pointer-events-none absolute right-[16%] bottom-[26%] hidden h-px w-[16%] -rotate-[22deg] bg-gradient-to-r from-transparent via-sky-200/24 to-transparent lg:block" />

      <section className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-[#0d1426]/90 p-6 shadow-[0_0_80px_rgba(15,23,42,0.55)] backdrop-blur md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.14),transparent_35%)]" />

        <div className="relative z-10">
          <Image
            src="/uptime-v2.png"
            alt="Uptime"
            width={300}
            height={72}
            className="mx-auto h-auto w-[180px] md:w-[220px]"
            priority
          />

          <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
            Acesso ao sistema
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="voce@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="********"
                autoComplete={modo === "login" ? "current-password" : "new-password"}
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
              type="submit"
              disabled={carregando}
              className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60"
            >
              {carregando
                ? "Processando..."
                : modo === "login"
                ? "Entrar"
                : "Criar conta"}
            </button>

            <button
              type="button"
              onClick={() =>
                setModo((atual) => (atual === "login" ? "cadastro" : "login"))
              }
              className="w-full rounded-2xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              {modo === "login" ? "Ainda nao tenho conta" : "Ja tenho conta"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
