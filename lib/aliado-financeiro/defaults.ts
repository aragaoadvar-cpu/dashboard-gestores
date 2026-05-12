import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceiroEscopo, FinanceiroTipo } from "./types";

const CATEGORIAS_PADRAO_PESSOAL: Array<{
  nome: string;
  tipo: FinanceiroTipo;
  cor: string;
}> = [
  { nome: "Casa", tipo: "despesa", cor: "#38bdf8" },
  { nome: "Carro", tipo: "despesa", cor: "#f97316" },
  { nome: "Alimentação", tipo: "despesa", cor: "#22c55e" },
  { nome: "Saúde", tipo: "despesa", cor: "#ef4444" },
  { nome: "Lazer", tipo: "despesa", cor: "#a855f7" },
  { nome: "Compras", tipo: "despesa", cor: "#eab308" },
  { nome: "Gastos adicionais", tipo: "despesa", cor: "#f43f5e" },
  { nome: "Contas fixas", tipo: "despesa", cor: "#14b8a6" },
  { nome: "Educação", tipo: "despesa", cor: "#6366f1" },
  { nome: "Outros", tipo: "despesa", cor: "#64748b" },
  { nome: "Salário", tipo: "receita", cor: "#22c55e" },
  { nome: "Comissão", tipo: "receita", cor: "#06b6d4" },
  { nome: "Freelance", tipo: "receita", cor: "#8b5cf6" },
  { nome: "Investimentos", tipo: "receita", cor: "#f59e0b" },
  { nome: "Outros ganhos", tipo: "receita", cor: "#94a3b8" },
];

const CATEGORIAS_PADRAO_EMPRESARIAL: Array<{
  nome: string;
  tipo: FinanceiroTipo;
  cor: string;
}> = [
  { nome: "Receita de vendas", tipo: "receita", cor: "#22c55e" },
  { nome: "Serviços", tipo: "receita", cor: "#06b6d4" },
  { nome: "Funcionários", tipo: "despesa", cor: "#f97316" },
  { nome: "Tráfego pago", tipo: "despesa", cor: "#ef4444" },
  { nome: "Softwares", tipo: "despesa", cor: "#8b5cf6" },
  { nome: "Impostos", tipo: "despesa", cor: "#eab308" },
  { nome: "Equipamentos", tipo: "despesa", cor: "#38bdf8" },
  { nome: "Fornecedores", tipo: "despesa", cor: "#14b8a6" },
  { nome: "Operacional", tipo: "despesa", cor: "#6366f1" },
  { nome: "Outros empresariais", tipo: "despesa", cor: "#64748b" },
];

function getCategoriasPadraoPorEscopo(escopo: FinanceiroEscopo) {
  return escopo === "empresarial"
    ? CATEGORIAS_PADRAO_EMPRESARIAL
    : CATEGORIAS_PADRAO_PESSOAL;
}

export async function garantirCategoriasFinanceirasPadrao(
  supabase: SupabaseClient,
  userId: string,
  escopo: FinanceiroEscopo
) {
  const { count, error } = await supabase
    .from("financeiro_categorias")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("escopo", escopo);

  if (error) {
    throw error;
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("financeiro_categorias").insert(
    getCategoriasPadraoPorEscopo(escopo).map((item) => ({
      user_id: userId,
      nome: item.nome,
      tipo: item.tipo,
      escopo,
      cor: item.cor,
    }))
  );

  if (insertError) {
    throw insertError;
  }
}
