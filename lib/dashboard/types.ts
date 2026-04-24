export type AdminSaudeStatus = "Saudável" | "Atenção" | "Crítico";

export type OwnerAdminCard = {
  adminId: string;
  nome: string;
  statusSaude: AdminSaudeStatus;
  proprio: {
    totalOperacoes: number;
    receita: number;
    lucro: number;
    roi: number;
  };
  equipe: {
    totalGestoresAtivos: number;
    totalOperacoes: number;
    receita: number;
    lucro: number;
    roi: number;
    gestoresNegativos: number;
    gestoresSemOperacao: number;
  };
  consolidado: {
    receita: number;
    lucro: number;
    roi: number;
  };
  alertasRapidos: string[];
};

export type OwnerDashboardData = {
  resumoGlobal: {
    receitaTotalPlataforma: number;
    lucroTotalPlataforma: number;
    roiGlobal: number;
    totalAdminsAtivos: number;
  };
  admins: OwnerAdminCard[];
  debug?: {
    totalAdminsEncontrados: number;
    adminIdsEncontrados: string[];
    totalVinculosAtivosEncontrados: number;
    totalGestoresEncontrados: number;
    gestorIdsEncontrados: string[];
    totalOperacoesNoPeriodo: number;
  };
};

export type OwnerGestorDetailItem = {
  gestorId: string;
  nome: string;
  totalOperacoes: number;
  receita: number;
  lucro: number;
  roi: number;
  status: AdminSaudeStatus;
};

export type OwnerAdminDetailData = {
  adminId: string;
  adminNome: string;
  statusSaude: AdminSaudeStatus;
  periodo: {
    mes: number;
    ano: number;
  };
  proprio: {
    totalOperacoes: number;
    receita: number;
    lucro: number;
    roi: number;
  };
  equipe: {
    totalGestoresAtivos: number;
    totalOperacoes: number;
    receita: number;
    lucro: number;
    roi: number;
    gestoresNegativos: number;
    gestoresSemOperacao: number;
  };
  consolidado: {
    totalOperacoes: number;
    receita: number;
    lucro: number;
    roi: number;
  };
  alertasRapidos: string[];
  gestores: OwnerGestorDetailItem[];
};

export type OwnerGestorOperationItem = {
  operacaoId: number;
  nomeOperacao: string;
  receita: number;
  custo: number;
  lucro: number;
  roi: number;
};

export type OwnerGestorDetailData = {
  gestorId: string;
  gestorNome: string;
  adminResponsavel: {
    adminId: string | null;
    adminNome: string;
  };
  periodo: {
    mes: number;
    ano: number;
  };
  statusSaude: AdminSaudeStatus;
  totais: {
    totalOperacoes: number;
    receita: number;
    custo: number;
    lucro: number;
    roi: number;
  };
  operacoes: OwnerGestorOperationItem[];
  alertasRapidos: string[];
};
