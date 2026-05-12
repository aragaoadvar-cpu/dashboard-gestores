export type FinanceiroTipo = "receita" | "despesa";
export type FinanceiroRecorrenciaTipo = "unica" | "recorrente" | "parcelada";
export type FinanceiroEscopo = "pessoal" | "empresarial";

export type FinanceiroCategoria = {
  id: string;
  user_id: string;
  nome: string;
  tipo: FinanceiroTipo;
  escopo: FinanceiroEscopo;
  cor: string | null;
  icone: string | null;
  created_at: string;
};

export type FinanceiroSubcategoria = {
  id: string;
  user_id: string;
  categoria_id: string;
  nome: string;
  escopo: FinanceiroEscopo;
  created_at: string;
};

export type FinanceiroMetaCategoria = {
  id: string;
  user_id: string;
  categoria_id: string;
  escopo: FinanceiroEscopo;
  mes: number;
  ano: number;
  limite_valor: number;
  created_at: string;
};

export type FinanceiroLancamento = {
  id: string;
  user_id: string;
  tipo: FinanceiroTipo;
  descricao: string;
  valor: number;
  data: string;
  escopo: FinanceiroEscopo;
  categoria_id: string | null;
  subcategoria_id: string | null;
  forma_pagamento: string | null;
  observacao: string | null;
  origem: "manual" | "whatsapp" | "importacao";
  recorrencia_tipo: FinanceiroRecorrenciaTipo;
  recorrencia_grupo_id: string | null;
  parcela_atual: number | null;
  parcela_total: number | null;
  recorrencia_ativa: boolean;
  recorrencia_dia: number | null;
  created_at: string;
  updated_at: string;
};

export type FinanceiroLancamentoComRelacoes = FinanceiroLancamento & {
  categoria?: Pick<FinanceiroCategoria, "id" | "nome" | "tipo" | "cor"> | null;
  subcategoria?: Pick<FinanceiroSubcategoria, "id" | "nome"> | null;
};
