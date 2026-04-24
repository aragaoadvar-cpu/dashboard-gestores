"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type RoleUsuario = "dono" | "admin" | "gestor" | "auxiliar";

type Props = {
  nomeInicial: string;
  emailAtual: string;
  roleAtual: RoleUsuario;
};

function getRoleLabel(role: RoleUsuario) {
  if (role === "dono") return "Dono";
  if (role === "admin") return "Admin";
  if (role === "auxiliar") return "Auxiliar";
  return "Gestor";
}

export default function ConfiguracaoPageClient({
  nomeInicial,
  emailAtual,
  roleAtual,
}: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [nome, setNome] = useState(nomeInicial);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [nomeErro, setNomeErro] = useState("");
  const [nomeSucesso, setNomeSucesso] = useState("");

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [senhaErro, setSenhaErro] = useState("");
  const [senhaSucesso, setSenhaSucesso] = useState("");

  async function salvarNome() {
    if (salvandoNome) return;

    setNomeErro("");
    setNomeSucesso("");

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setNomeErro("Digite um nome válido.");
      return;
    }

    setSalvandoNome(true);
    const { error } = await supabase.rpc("update_my_profile_name", {
      p_nome: nomeLimpo,
    });
    setSalvandoNome(false);

    if (error) {
      setNomeErro(`Erro ao atualizar nome: ${error.message}`);
      return;
    }

    setNome(nomeLimpo);
    setNomeSucesso("Nome atualizado com sucesso.");
    router.refresh();
  }

  async function alterarSenha() {
    if (salvandoSenha) return;

    setSenhaErro("");
    setSenhaSucesso("");

    if (!novaSenha || !confirmarSenha) {
      setSenhaErro("Preencha os dois campos de senha.");
      return;
    }

    if (novaSenha.length < 6) {
      setSenhaErro("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setSenhaErro("A confirmação de senha não confere.");
      return;
    }

    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
    });
    setSalvandoSenha(false);

    if (error) {
      setSenhaErro(`Erro ao atualizar senha: ${error.message}`);
      return;
    }

    setNovaSenha("");
    setConfirmarSenha("");
    setSenhaSucesso("Senha atualizada com sucesso.");
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-5xl">
        <header className="rounded-[24px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_14px_30px_rgba(2,6,23,0.45)] md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
            Conta
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
            Configurações
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Atualize seu nome e senha com segurança.
          </p>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-[24px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_14px_30px_rgba(2,6,23,0.45)] md:p-6">
            <h2 className="text-lg font-extrabold text-white md:text-xl">Perfil</h2>
            <p className="mt-1 text-sm text-slate-300">
              Nome atual: <strong className="text-white">{nome.trim() || nomeInicial}</strong>
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-200">
                Nome
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                placeholder="Digite seu nome"
              />
            </div>

            {!!nomeErro && (
              <p className="mt-3 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {nomeErro}
              </p>
            )}
            {!!nomeSucesso && (
              <p className="mt-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {nomeSucesso}
              </p>
            )}

            <button
              type="button"
              onClick={salvarNome}
              disabled={salvandoNome}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60"
            >
              {salvandoNome ? "Salvando..." : "Salvar nome"}
            </button>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_14px_30px_rgba(2,6,23,0.45)] md:p-6">
            <h2 className="text-lg font-extrabold text-white md:text-xl">Segurança</h2>
            <p className="mt-1 text-sm text-slate-300">
              Altere sua senha de acesso.
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-200">
                Nova senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                placeholder="Digite a nova senha"
              />
            </div>

            <div className="mt-3">
              <label className="mb-2 block text-sm font-semibold text-slate-200">
                Confirmar nova senha
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100 placeholder:text-slate-500"
                placeholder="Confirme a nova senha"
              />
            </div>

            {!!senhaErro && (
              <p className="mt-3 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {senhaErro}
              </p>
            )}
            {!!senhaSucesso && (
              <p className="mt-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {senhaSucesso}
              </p>
            )}

            <button
              type="button"
              onClick={alterarSenha}
              disabled={salvandoSenha}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60"
            >
              {salvandoSenha ? "Atualizando..." : "Alterar senha"}
            </button>
          </section>
        </div>

        <section className="mt-5 rounded-[24px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_14px_30px_rgba(2,6,23,0.45)] md:p-6">
          <h2 className="text-lg font-extrabold text-white md:text-xl">Informações</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0b1222] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Email
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {emailAtual || "Não disponível"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0b1222] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Role
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {getRoleLabel(roleAtual)}
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
