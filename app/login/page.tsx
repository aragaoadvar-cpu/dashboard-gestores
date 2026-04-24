"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
        error: result.message ?? "Não foi possível aceitar o convite pendente.",
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
        error: `Convite aceito, mas não foi possível confirmar o perfil atualizado: ${profileAtualizadoError.message}`,
      };
    }

    if (!profileAtualizado?.role) {
      return {
        success: false as const,
        error: "Convite aceito, mas o perfil não foi encontrado após o aceite.",
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
          setErro("Não foi possível identificar o usuário após login.");
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
        router.push(nomeAtual ? "/" : "/completar-cadastro");
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
        "Cadastro realizado. Se o projeto exigir confirmação por email, confirme antes de entrar."
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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06080f] p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.18),transparent_35%)]" />

      <section className="relative z-10 w-full max-w-md rounded-[28px] border border-white/15 bg-[#0d1426]/90 p-6 shadow-[0_0_80px_rgba(15,23,42,0.55)] backdrop-blur md:p-8">
        <Image
          src="/uptime-v2.png"
          alt="Uptime"
          width={300}
          height={72}
          className="h-auto w-[180px] md:w-[220px]"
          priority
        />

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Acesso ao sistema
        </p>

        <h1 className="mt-2 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-2xl font-extrabold text-transparent md:text-3xl">
          {modo === "login" ? "Entrar" : "Criar conta"}
        </h1>

        <p className="mt-2 text-sm text-slate-300">
          Use seu email e senha para acessar seu painel.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
              placeholder="voce@email.com"
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
              className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
              placeholder="********"
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
            onClick={entrarOuCadastrar}
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
            {modo === "login"
              ? "Ainda não tenho conta"
              : "Já tenho conta"}
          </button>
        </div>
      </section>
    </main>
  );
}
