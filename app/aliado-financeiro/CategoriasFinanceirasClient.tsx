"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { garantirCategoriasFinanceirasPadrao } from "@/lib/aliado-financeiro/defaults";
import FinanceiroSharedBanner from "./FinanceiroSharedBanner";
import type {
  FinanceiroCategoria,
  FinanceiroEscopo,
  FinanceiroSubcategoria,
  FinanceiroTipo,
} from "@/lib/aliado-financeiro/types";

type CategoriaForm = {
  nome: string;
  tipo: FinanceiroTipo;
};

type SubcategoriaForm = {
  categoria_id: string;
  nome: string;
};

type Props = {
  ownerUserId: string;
  ownerNome: string;
  canEdit: boolean;
  isSharedView: boolean;
  escopo: FinanceiroEscopo;
};

export default function CategoriasFinanceirasClient({
  ownerUserId,
  ownerNome,
  canEdit,
  isSharedView,
  escopo,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<FinanceiroSubcategoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [categoriaForm, setCategoriaForm] = useState<CategoriaForm>({ nome: "", tipo: "despesa" });
  const [subcategoriaForm, setSubcategoriaForm] = useState<SubcategoriaForm>({ categoria_id: "", nome: "" });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setMensagem("");

    try {
      if (!isSharedView) {
        await garantirCategoriasFinanceirasPadrao(supabase, ownerUserId, escopo);
      }

      const [categoriasResp, subcategoriasResp] = await Promise.all([
        supabase
          .from("financeiro_categorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .order("tipo")
          .order("nome"),
        supabase
          .from("financeiro_subcategorias")
          .select("*")
          .eq("user_id", ownerUserId)
          .eq("escopo", escopo)
          .order("nome"),
      ]);

      if (categoriasResp.error) throw categoriasResp.error;
      if (subcategoriasResp.error) throw subcategoriasResp.error;

      setCategorias((categoriasResp.data as FinanceiroCategoria[]) ?? []);
      setSubcategorias((subcategoriasResp.data as FinanceiroSubcategoria[]) ?? []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar categorias.");
    } finally {
      setCarregando(false);
    }
  }, [escopo, isSharedView, ownerUserId, supabase]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const categoriasDespesa = useMemo(
    () => categorias.filter((item) => item.tipo === "despesa"),
    [categorias]
  );
  const categoriasReceita = useMemo(
    () => categorias.filter((item) => item.tipo === "receita"),
    [categorias]
  );

  async function salvarCategoria() {
    if (!canEdit || isSharedView) return;
    setErro("");
    setMensagem("");

    if (!categoriaForm.nome.trim()) {
      setErro("Digite um nome para a categoria.");
      return;
    }

    const { error } = await supabase.from("financeiro_categorias").insert({
      user_id: ownerUserId,
      nome: categoriaForm.nome.trim(),
      tipo: categoriaForm.tipo,
      escopo,
    });

    if (error) {
      setErro(error.message);
      return;
    }

    setCategoriaForm({ nome: "", tipo: categoriaForm.tipo });
    setMensagem("Categoria criada com sucesso.");
    void carregar();
  }

  async function salvarSubcategoria() {
    if (!canEdit || isSharedView) return;
    setErro("");
    setMensagem("");

    if (!subcategoriaForm.categoria_id || !subcategoriaForm.nome.trim()) {
      setErro("Escolha a categoria e informe o nome da subcategoria.");
      return;
    }

    const { error } = await supabase.from("financeiro_subcategorias").insert({
      user_id: ownerUserId,
      categoria_id: subcategoriaForm.categoria_id,
      nome: subcategoriaForm.nome.trim(),
      escopo,
    });

    if (error) {
      setErro(error.message);
      return;
    }

    setSubcategoriaForm({ categoria_id: subcategoriaForm.categoria_id, nome: "" });
    setMensagem("Subcategoria criada com sucesso.");
    void carregar();
  }

  async function editarCategoria(item: FinanceiroCategoria) {
    if (!canEdit || isSharedView) return;
    const nome = window.prompt("Novo nome da categoria:", item.nome)?.trim();
    if (!nome || nome === item.nome) return;

    const { error } = await supabase
      .from("financeiro_categorias")
      .update({ nome })
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Categoria atualizada.");
    void carregar();
  }

  async function excluirCategoria(item: FinanceiroCategoria) {
    if (!canEdit || isSharedView) return;
    const ok = window.confirm(`Excluir a categoria "${item.nome}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("financeiro_categorias")
      .delete()
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Categoria excluída.");
    void carregar();
  }

  async function editarSubcategoria(item: FinanceiroSubcategoria) {
    if (!canEdit || isSharedView) return;
    const nome = window.prompt("Novo nome da subcategoria:", item.nome)?.trim();
    if (!nome || nome === item.nome) return;

    const { error } = await supabase
      .from("financeiro_subcategorias")
      .update({ nome })
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Subcategoria atualizada.");
    void carregar();
  }

  async function excluirSubcategoria(item: FinanceiroSubcategoria) {
    if (!canEdit || isSharedView) return;
    const ok = window.confirm(`Excluir a subcategoria "${item.nome}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("financeiro_subcategorias")
      .delete()
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Subcategoria excluída.");
    void carregar();
  }

  function renderGrupo(titulo: string, itens: FinanceiroCategoria[]) {
    return (
      <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
        <h2 className="text-xl font-extrabold text-white">{titulo}</h2>
        <div className="mt-4 space-y-3">
          {itens.map((categoria) => {
            const subcats = subcategorias.filter((item) => item.categoria_id === categoria.id);
            return (
              <div key={categoria.id} className="rounded-[22px] border border-white/10 bg-[#0b1222]/75 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{categoria.nome}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {subcats.length === 0 ? (
                        <span className="text-sm text-slate-400">Sem subcategorias ainda.</span>
                      ) : (
                        subcats.map((subcategoria) => (
                          <div
                            key={subcategoria.id}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"
                          >
                            <span className="text-xs font-semibold text-slate-200">
                              {subcategoria.nome}
                            </span>
                            {canEdit && !isSharedView && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void editarSubcategoria(subcategoria)}
                                  className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100 transition hover:bg-white/10"
                                >
                                  E
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void excluirSubcategoria(subcategoria)}
                                  className="rounded-full border border-rose-300/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100 transition hover:bg-rose-500/20"
                                >
                                  X
                                </button>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {canEdit && !isSharedView && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void editarCategoria(categoria)}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubcategoriaForm({ categoria_id: categoria.id, nome: "" });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                      >
                        Nova subcategoria
                      </button>
                      <button
                        type="button"
                        onClick={() => void excluirCategoria(categoria)}
                        className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Excluir categoria
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!carregando && itens.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-white/15 bg-[#0b1222]/60 p-5 text-sm text-slate-300">
              Nenhuma categoria cadastrada neste grupo.
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl">
        <FinanceiroSharedBanner
          isSharedView={isSharedView}
          ownerNome={ownerNome}
          canEdit={canEdit}
        />

        <header className="rounded-[28px] border border-white/10 bg-[#0b1222]/90 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Aliado Financeiro
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-white md:text-4xl">Categorias</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
            Organize receitas e despesas com categorias e subcategorias alinhadas ao seu padrão real de vida.
            Escopo atual: {escopo === "empresarial" ? "Empresarial" : "Pessoal"}.
          </p>
        </header>

        {canEdit && !isSharedView ? (
          <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <h2 className="text-xl font-extrabold text-white">Nova categoria</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={categoriaForm.nome}
                  onChange={(e) => setCategoriaForm((prev) => ({ ...prev, nome: e.target.value }))}
                  className="rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                  placeholder="Nome da categoria"
                />
                <select
                  value={categoriaForm.tipo}
                  onChange={(e) =>
                    setCategoriaForm((prev) => ({ ...prev, tipo: e.target.value as FinanceiroTipo }))
                  }
                  className="rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void salvarCategoria()}
                className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Salvar categoria
              </button>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-[#0a1020]/90 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <h2 className="text-xl font-extrabold text-white">Nova subcategoria</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={subcategoriaForm.categoria_id}
                  onChange={(e) =>
                    setSubcategoriaForm((prev) => ({ ...prev, categoria_id: e.target.value }))
                  }
                  className="rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                >
                  <option value="">Escolha a categoria</option>
                  {categoriasDespesa.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
                <input
                  value={subcategoriaForm.nome}
                  onChange={(e) =>
                    setSubcategoriaForm((prev) => ({ ...prev, nome: e.target.value }))
                  }
                  className="rounded-2xl border border-white/15 bg-[#0b1222] px-4 py-3 text-slate-100"
                  placeholder="Nome da subcategoria"
                />
              </div>
              <button
                type="button"
                onClick={() => void salvarSubcategoria()}
                className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Salvar subcategoria
              </button>
            </article>
          </section>
        ) : (
          <section className="mt-6 rounded-[28px] border border-dashed border-white/15 bg-[#0a1020]/70 p-5 text-sm text-slate-300">
            Categorias e subcategorias ficam em modo leitura durante o compartilhamento para evitar
            mudanças estruturais no financeiro de outra pessoa.
          </section>
        )}

        {erro && (
          <div className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {erro}
          </div>
        )}
        {mensagem && (
          <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {mensagem}
          </div>
        )}

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {renderGrupo("Categorias de despesa", categoriasDespesa)}
          {renderGrupo("Categorias de receita", categoriasReceita)}
        </section>
      </section>
    </main>
  );
}
