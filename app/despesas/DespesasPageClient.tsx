"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { getMesAnoFromSearchParams } from "../../lib/periodo";
import {
  isOperationalAdminRole,
  parseRole,
  type RoleUsuario,
} from "@/lib/platform-access/roles";
import MonthYearPicker from "../components/MonthYearPicker";

type Despesa = {
  id: number;
  nome: string;
  valor: number | null;
  percentual_desconto: number | null;
  mes: number;
  ano: number;
  user_id: string | null;
};

type PerfilDonoDespesa = {
  id: string;
  nome: string | null;
  email: string | null;
};

const MESES = [
  { valor: 1, nome: "Janeiro", label: "01" },
  { valor: 2, nome: "Fevereiro", label: "02" },
  { valor: 3, nome: "Março", label: "03" },
  { valor: 4, nome: "Abril", label: "04" },
  { valor: 5, nome: "Maio", label: "05" },
  { valor: 6, nome: "Junho", label: "06" },
  { valor: 7, nome: "Julho", label: "07" },
  { valor: 8, nome: "Agosto", label: "08" },
  { valor: 9, nome: "Setembro", label: "09" },
  { valor: 10, nome: "Outubro", label: "10" },
  { valor: 11, nome: "Novembro", label: "11" },
  { valor: 12, nome: "Dezembro", label: "12" },
];

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseNumero(valor: string): number {
  if (!valor) return 0;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? 0 : numero;
}

type TotaisDespesa = {
  totalDespesas: number;
  totalDebitado: number;
};

function calcularTotaisDespesas(despesas: Despesa[]): TotaisDespesa {
  const totalDespesas = despesas.reduce((acc, despesa) => acc + Number(despesa.valor ?? 0), 0);
  const totalDebitado = despesas.reduce((acc, despesa) => {
    const valor = Number(despesa.valor ?? 0);
    const percentual = Number(despesa.percentual_desconto ?? 0);
    return acc + valor * (percentual / 100);
  }, 0);

  return { totalDespesas, totalDebitado };
}

export default function DespesasPageClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hoje = useMemo(() => new Date(), []);
  const periodoInicial = useMemo(() => getMesAnoFromSearchParams(searchParams, hoje), [searchParams, hoje]);

  const [mesSelecionado, setMesSelecionado] = useState(periodoInicial.mes);
  const [anoSelecionado, setAnoSelecionado] = useState(periodoInicial.ano);

  const [roleUsuario, setRoleUsuario] = useState<RoleUsuario>("gestor");
  const [userIdAtual, setUserIdAtual] = useState("");
  const [ownerIdAuxiliar, setOwnerIdAuxiliar] = useState<string | null>(null);
  const [nomeUsuarioAtual, setNomeUsuarioAtual] = useState("");
  const [gestoresVinculadosIds, setGestoresVinculadosIds] = useState<string[]>([]);

  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [perfisDonoPorId, setPerfisDonoPorId] = useState<Record<string, PerfilDonoDespesa>>({});
  const [filtroDonoDespesaId, setFiltroDonoDespesaId] = useState("todos");

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [novaDespesaNome, setNovaDespesaNome] = useState("");
  const [novaDespesaValor, setNovaDespesaValor] = useState("");
  const [novoPercentualDesconto, setNovoPercentualDesconto] = useState("30");
  const [userIdNovaDespesa, setUserIdNovaDespesa] = useState("");
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  const [despesaEditandoId, setDespesaEditandoId] = useState<number | null>(null);
  const [editarDespesaNome, setEditarDespesaNome] = useState("");
  const [editarDespesaValor, setEditarDespesaValor] = useState("");
  const [editarPercentualDesconto, setEditarPercentualDesconto] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoDespesaId, setExcluindoDespesaId] = useState<number | null>(null);

  const nomeMesSelecionado = useMemo(() => {
    return MESES.find((mes) => mes.valor === mesSelecionado)?.nome || "";
  }, [mesSelecionado]);

  const labelPerfilAtual = useMemo(() => {
    if (isOperationalAdminRole(roleUsuario)) {
      const nome = nomeUsuarioAtual.trim();
      return nome ? `${nome} - Admin` : "Admin";
    }
    if (roleUsuario === "dono") return "Dono";
    if (roleUsuario === "auxiliar") return "Auxiliar";
    return "Gestor";
  }, [roleUsuario, nomeUsuarioAtual]);

  const obterLabelDono = useCallback(
    (userId: string | null): string => {
      if (!userId) return "Usuário não identificado";

      const perfil = perfisDonoPorId[userId];
      if (!perfil) return "Usuário não identificado";

      const nome = perfil.nome?.trim() || "";
      const email = perfil.email?.trim() || "";

      if (nome && email) return `${nome} (${email})`;
      return nome || email || "Usuário não identificado";
    },
    [perfisDonoPorId]
  );

  const obterRoleDonoDespesa = useCallback(
    (userId: string | null): string | null => {
      if (!userId) return null;
      if (userId === userIdAtual) {
        if (isOperationalAdminRole(roleUsuario)) return "Admin";
        if (roleUsuario === "gestor") return "Gestor";
        if (roleUsuario === "dono") return "Dono";
        if (roleUsuario === "auxiliar") return "Auxiliar";
      }

      if (gestoresVinculadosIds.includes(userId)) {
        return "Gestor";
      }

      if (roleUsuario === "auxiliar" && ownerIdAuxiliar === userId) {
        return "Vinculado";
      }

      return null;
    },
    [gestoresVinculadosIds, ownerIdAuxiliar, roleUsuario, userIdAtual]
  );

  const donosDisponiveis = useMemo(() => {
    const ownerIds = Array.from(new Set(despesas.map((item) => item.user_id).filter(Boolean)));

    return ownerIds
      .map((id) => {
        const userId = id as string;
        return {
          id: userId,
          label: obterLabelDono(userId),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [despesas, obterLabelDono]);

  const despesasFiltradas = useMemo(() => {
    const base =
      filtroDonoDespesaId === "todos"
        ? despesas
        : despesas.filter((despesa) => despesa.user_id === filtroDonoDespesaId);

    return [...base].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    );
  }, [despesas, filtroDonoDespesaId]);

  const opcoesCriarDespesaPara = useMemo(() => {
    if (!isOperationalAdminRole(roleUsuario) || !userIdAtual) return [];

    return [userIdAtual, ...gestoresVinculadosIds].map((userId) => ({
      id: userId,
      label:
        userId === userIdAtual
          ? labelPerfilAtual
          : obterLabelDono(userId) === "Usuário não identificado"
          ? "Gestor vinculado"
          : obterLabelDono(userId),
    }));
  }, [gestoresVinculadosIds, labelPerfilAtual, obterLabelDono, roleUsuario, userIdAtual]);

  const totais = useMemo(() => {
    const gestoresSet = new Set(gestoresVinculadosIds);
    const userOwnerAtual = roleUsuario === "auxiliar" ? ownerIdAuxiliar : userIdAtual;

    const despesasProprias = despesas.filter((despesa) => despesa.user_id === userOwnerAtual);
    const despesasEquipe =
      isOperationalAdminRole(roleUsuario)
        ? despesas.filter((despesa) => despesa.user_id && gestoresSet.has(despesa.user_id))
        : roleUsuario === "dono"
        ? despesas.filter((despesa) => despesa.user_id !== userIdAtual)
        : [];

    return {
      proprio: calcularTotaisDespesas(despesasProprias),
      equipe: calcularTotaisDespesas(despesasEquipe),
      consolidado: calcularTotaisDespesas(despesas),
      filtrado: calcularTotaisDespesas(despesasFiltradas),
    };
  }, [despesas, despesasFiltradas, gestoresVinculadosIds, roleUsuario, userIdAtual, ownerIdAuxiliar]);

  useEffect(() => {
    setMesSelecionado(periodoInicial.mes);
    setAnoSelecionado(periodoInicial.ano);
  }, [periodoInicial]);

  const atualizarPeriodoNaUrl = useCallback(
    (mes: number, ano: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("mes", String(mes));
      params.set("ano", String(ano));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  function podeAdminGerenciarDespesa(userIdDespesa: string | null): boolean {
    if (!isOperationalAdminRole(roleUsuario) || !userIdDespesa) return false;
    return userIdDespesa === userIdAtual || gestoresVinculadosIds.includes(userIdDespesa);
  }

  function getMensagemPermissaoDespesa(acao: "editar" | "excluir"): string {
    if (isOperationalAdminRole(roleUsuario)) {
      return `Você só pode ${acao} despesas próprias ou de gestores vinculados.`;
    }

    return `Você só pode ${acao} despesas próprias.`;
  }

  const carregarDespesas = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setMensagem("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setOwnerIdAuxiliar(null);
      setErro("Usuário não autenticado.");
      setCarregando(false);
      return;
    }

    setUserIdAtual(user.id);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role, nome")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setErro(
        `Erro ao carregar perfil do usuário: ${
          profileError?.message ?? "Perfil não encontrado."
        }`
      );
      setCarregando(false);
      return;
    }

    const roleAtual = parseRole(profileData.role) ?? "gestor";
    setRoleUsuario(roleAtual);
    setNomeUsuarioAtual((profileData.nome ?? "").trim());

    let gestoresDoAdmin: string[] = [];
    let ownerDoAuxiliar: string | null = null;
    if (isOperationalAdminRole(roleAtual)) {
      const { data: gestoresData, error: gestoresError } = await supabase
        .from("admin_gestores")
        .select("gestor_user_id")
        .eq("admin_user_id", user.id)
        .eq("status", "ativo");

      if (gestoresError) {
        setErro(`Erro ao carregar gestores vinculados: ${JSON.stringify(gestoresError)}`);
        setCarregando(false);
        return;
      }

      gestoresDoAdmin =
        (gestoresData as Array<{ gestor_user_id: string | null }>)
          ?.map((item) => item.gestor_user_id)
          .filter((id): id is string => Boolean(id)) || [];
    } else if (roleAtual === "auxiliar") {
      const { data: ownerIdAuxiliarData, error: ownerIdAuxiliarError } = await supabase.rpc(
        "get_auxiliar_owner_id",
        { check_auxiliar_id: user.id }
      );

      if (ownerIdAuxiliarError) {
        setErro(`Erro ao carregar vínculo do auxiliar: ${JSON.stringify(ownerIdAuxiliarError)}`);
        setCarregando(false);
        return;
      }

      if (!ownerIdAuxiliarData) {
        setErro("Auxiliar sem vínculo ativo com admin/gestor.");
        setCarregando(false);
        return;
      }

      ownerDoAuxiliar = ownerIdAuxiliarData;
    }
    setGestoresVinculadosIds(gestoresDoAdmin);
    setOwnerIdAuxiliar(ownerDoAuxiliar);

    if (isOperationalAdminRole(roleAtual)) {
      const ownersPermitidos = new Set([user.id, ...gestoresDoAdmin]);
      setUserIdNovaDespesa((atual) => (ownersPermitidos.has(atual) ? atual : user.id));
    } else {
      setUserIdNovaDespesa(user.id);
    }

    let despesasQuery = supabase
      .from("despesas")
      .select("id, nome, valor, percentual_desconto, mes, ano, user_id")
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado)
      .order("id", { ascending: false });

    if (roleAtual === "gestor") {
      despesasQuery = despesasQuery.eq("user_id", user.id);
    } else if (isOperationalAdminRole(roleAtual)) {
      despesasQuery = despesasQuery.in("user_id", [user.id, ...gestoresDoAdmin]);
    } else if (roleAtual === "auxiliar" && ownerDoAuxiliar) {
      despesasQuery = despesasQuery.eq("user_id", ownerDoAuxiliar);
    }

    const { data: despesasData, error: despesasError } = await despesasQuery;

    if (despesasError) {
      setErro(`Erro ao carregar despesas: ${JSON.stringify(despesasError)}`);
      setCarregando(false);
      return;
    }

    const despesasLista = (despesasData as Despesa[]) || [];
    setDespesas(despesasLista);

    const ownerIds = Array.from(
      new Set(
        [
          ...despesasLista.map((item) => item.user_id).filter(Boolean),
          ...(isOperationalAdminRole(roleAtual) ? [user.id, ...gestoresDoAdmin] : []),
        ].filter(Boolean)
      )
    ) as string[];

    if (ownerIds.length === 0) {
      setPerfisDonoPorId({});
      setFiltroDonoDespesaId("todos");
      setCarregando(false);
      return;
    }

    let perfisLista:
      | Array<{ id: string; nome: string | null; email: string | null }>
      | null = null;

    const { data: perfisComEmail, error: perfisComEmailError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", ownerIds);

    if (!perfisComEmailError) {
      perfisLista = ((perfisComEmail as Array<{ id: string; nome: string | null }>) || []).map(
        (item) => ({
          id: item.id,
          nome: item.nome,
          email: null,
        })
      );
    } else {
      const { data: perfisSemEmail, error: perfisSemEmailError } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ownerIds);

      if (perfisSemEmailError) {
        setErro(`Erro ao carregar donos das despesas: ${JSON.stringify(perfisSemEmailError)}`);
        setCarregando(false);
        return;
      }

      perfisLista = (
        (perfisSemEmail as Array<{ id: string; nome: string | null }>) || []
      ).map((item) => ({
        id: item.id,
        nome: item.nome,
        email: null,
      }));
    }

    const mapaPerfis: Record<string, PerfilDonoDespesa> = {};
    for (const perfil of perfisLista || []) {
      if (!perfil.id) continue;
      mapaPerfis[perfil.id] = perfil;
    }
    setPerfisDonoPorId(mapaPerfis);

    if (roleAtual === "gestor" || roleAtual === "auxiliar") {
      setFiltroDonoDespesaId("todos");
    } else if (filtroDonoDespesaId !== "todos" && !ownerIds.includes(filtroDonoDespesaId)) {
      setFiltroDonoDespesaId("todos");
    }

    setCarregando(false);
  }, [supabase, mesSelecionado, anoSelecionado, filtroDonoDespesaId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void carregarDespesas();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [carregarDespesas]);

  async function salvarDespesa() {
    setErro("");
    setMensagem("");

    const valorNumerico = parseNumero(novaDespesaValor);
    const percentualNumerico = parseNumero(novoPercentualDesconto);

    if (!novaDespesaNome.trim()) {
      setErro("Digite o nome da despesa.");
      return;
    }

    if (valorNumerico <= 0) {
      setErro("Digite um valor de despesa válido.");
      return;
    }

    if (percentualNumerico < 0) {
      setErro("Digite uma % de débito válida.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErro("Usuário não autenticado.");
      return;
    }

    setSalvandoDespesa(true);

    const ownerIdParaDespesa =
      roleUsuario === "auxiliar"
        ? ownerIdAuxiliar
        : isOperationalAdminRole(roleUsuario)
        ? userIdNovaDespesa
        : user.id;
    if (!ownerIdParaDespesa) {
      setErro("Auxiliar sem vínculo ativo para lançar despesa.");
      setSalvandoDespesa(false);
      return;
    }

    const { error } = await supabase.from("despesas").insert([
      {
        nome: novaDespesaNome.trim(),
        valor: valorNumerico,
        percentual_desconto: percentualNumerico,
        mes: mesSelecionado,
        ano: anoSelecionado,
        user_id: ownerIdParaDespesa,
      },
    ]);

    if (error) {
      setErro(`Erro ao salvar despesa: ${JSON.stringify(error)}`);
      setSalvandoDespesa(false);
      return;
    }

    setNovaDespesaNome("");
    setNovaDespesaValor("");
    setNovoPercentualDesconto("30");
    setMensagem("Despesa adicionada com sucesso.");
    setSalvandoDespesa(false);
    void carregarDespesas();
  }

  function iniciarEdicaoDespesa(despesa: Despesa) {
    const userOwnerEditavel = roleUsuario === "auxiliar" ? ownerIdAuxiliar : userIdAtual;
    const podeEditar =
      (Boolean(userOwnerEditavel) && despesa.user_id === userOwnerEditavel) ||
      podeAdminGerenciarDespesa(despesa.user_id);

    if (!podeEditar) {
      setErro(getMensagemPermissaoDespesa("editar"));
      return;
    }

    setDespesaEditandoId(despesa.id);
    setEditarDespesaNome(despesa.nome);
    setEditarDespesaValor(String(despesa.valor ?? ""));
    setEditarPercentualDesconto(String(despesa.percentual_desconto ?? ""));
    setMensagem("");
    setErro("");
  }

  function cancelarEdicaoDespesa() {
    setDespesaEditandoId(null);
    setEditarDespesaNome("");
    setEditarDespesaValor("");
    setEditarPercentualDesconto("");
  }

  async function salvarEdicaoDespesa(id: number) {
    setErro("");
    setMensagem("");

    const despesaAlvo = despesas.find((despesa) => despesa.id === id);
    const userOwnerEditavel = roleUsuario === "auxiliar" ? ownerIdAuxiliar : userIdAtual;
    const podeEditar =
      !!despesaAlvo &&
      ((Boolean(userOwnerEditavel) && despesaAlvo.user_id === userOwnerEditavel) ||
        podeAdminGerenciarDespesa(despesaAlvo.user_id));

    if (!podeEditar) {
      setErro(getMensagemPermissaoDespesa("editar"));
      return;
    }

    const valorNumerico = parseNumero(editarDespesaValor);
    const percentualNumerico = parseNumero(editarPercentualDesconto);

    if (!editarDespesaNome.trim()) {
      setErro("Digite o nome da despesa.");
      return;
    }

    if (valorNumerico <= 0) {
      setErro("Digite um valor válido para a despesa.");
      return;
    }

    if (percentualNumerico < 0) {
      setErro("Digite uma % de débito válida.");
      return;
    }

    setSalvandoEdicao(true);

    const { error } = await supabase
      .from("despesas")
      .update({
        nome: editarDespesaNome.trim(),
        valor: valorNumerico,
        percentual_desconto: percentualNumerico,
      })
      .eq("id", id);

    if (error) {
      setErro(`Erro ao editar despesa: ${JSON.stringify(error)}`);
      setSalvandoEdicao(false);
      return;
    }

    setMensagem("Despesa atualizada com sucesso.");
    setSalvandoEdicao(false);
    cancelarEdicaoDespesa();
    void carregarDespesas();
  }

  async function excluirDespesa(id: number) {
    const despesaAlvo = despesas.find((despesa) => despesa.id === id);
    const userOwnerEditavel = roleUsuario === "auxiliar" ? ownerIdAuxiliar : userIdAtual;
    const podeExcluir =
      !!despesaAlvo &&
      ((Boolean(userOwnerEditavel) && despesaAlvo.user_id === userOwnerEditavel) ||
        podeAdminGerenciarDespesa(despesaAlvo.user_id));

    if (!podeExcluir) {
      setErro(getMensagemPermissaoDespesa("excluir"));
      return;
    }

    const confirmar = window.confirm("Tem certeza que deseja excluir esta despesa?");
    if (!confirmar) return;

    setErro("");
    setMensagem("");
    setExcluindoDespesaId(id);

    const { error } = await supabase.from("despesas").delete().eq("id", id);

    if (error) {
      setErro(`Erro ao excluir despesa: ${JSON.stringify(error)}`);
      setExcluindoDespesaId(null);
      return;
    }

    setMensagem("Despesa excluída com sucesso.");
    setExcluindoDespesaId(null);

    if (despesaEditandoId === id) {
      cancelarEdicaoDespesa();
    }

    void carregarDespesas();
  }

  return (
    <main className="min-h-screen bg-transparent p-4 md:p-6 xl:p-8">
      <section className="mx-auto max-w-7xl">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-100 md:text-4xl xl:text-5xl">Despesas</h1>
          <p className="mt-2 text-sm text-slate-400 md:text-lg">
            Gestão operacional de despesas do período selecionado
          </p>
        </header>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0f172a]/85 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.55)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <MonthYearPicker
              mes={mesSelecionado}
              ano={anoSelecionado}
              onChange={(mes, ano) => {
                setMesSelecionado(mes);
                setAnoSelecionado(ano);
                atualizarPeriodoNaUrl(mes, ano);
              }}
              variant="dark"
            />

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 md:text-base">
              Período selecionado:{" "}
              <span className="font-semibold text-slate-100">
                {nomeMesSelecionado} {anoSelecionado}
              </span>
            </div>
          </div>

          {!!mensagem && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {mensagem}
            </div>
          )}

          {!!erro && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-xl font-extrabold text-slate-100 md:text-2xl">Nova despesa</h2>
            <p className="mt-1 text-sm text-slate-400 md:text-base">
              Perfil atual: <span className="font-semibold">{labelPerfilAtual}</span>
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr_0.8fr_auto]">
              {isOperationalAdminRole(roleUsuario) && (
                <div className="md:col-span-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Criar despesa para
                  </label>
                  <select
                    value={userIdNovaDespesa}
                    onChange={(e) => setUserIdNovaDespesa(e.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-sm text-slate-100 md:max-w-md md:text-base"
                  >
                    {opcoesCriarDespesaPara.map((opcao) => (
                      <option key={opcao.id} value={opcao.id}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Nome da despesa
                </label>
                <input
                  value={novaDespesaNome}
                  onChange={(e) => setNovaDespesaNome(e.target.value)}
                  placeholder="Ex: Ferramenta, Freelancer, Conta"
                  className="w-full rounded-xl border border-white/20 bg-[#0b1222] px-4 py-3 text-base text-slate-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Valor</label>
                <input
                  value={novaDespesaValor}
                  onChange={(e) => setNovaDespesaValor(e.target.value)}
                  placeholder="Ex: 250,00"
                  className="w-full rounded-xl border border-white/20 bg-[#0b1222] px-4 py-3 text-base text-slate-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">% debitada</label>
                <input
                  value={novoPercentualDesconto}
                  onChange={(e) => setNovoPercentualDesconto(e.target.value)}
                  placeholder="Ex: 30"
                  className="w-full rounded-xl border border-white/20 bg-[#0b1222] px-4 py-3 text-base text-slate-100"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={salvarDespesa}
                  disabled={salvandoDespesa}
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
                >
                  {salvandoDespesa ? "Salvando..." : "Salvar despesa"}
                </button>
              </div>
            </div>
          </div>

          {(isOperationalAdminRole(roleUsuario) || roleUsuario === "dono") && (
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Filtrar por gestor/dono da despesa
              </label>
              <select
                value={filtroDonoDespesaId}
                onChange={(e) => setFiltroDonoDespesaId(e.target.value)}
                className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0b1222] px-4 py-3 text-sm text-slate-100 md:text-base"
              >
                <option value="todos">Todos</option>
                {donosDisponiveis.map((dono) => (
                  <option key={dono.id} value={dono.id}>
                    {dono.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {(roleUsuario === "gestor" || roleUsuario === "auxiliar") && (
              <>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Total de despesas próprias</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.proprio.totalDespesas)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Total debitado próprio</p>
                  <p className="mt-2 text-xl font-extrabold text-rose-600 md:text-2xl">
                    R$ {formatarNumero(totais.proprio.totalDebitado)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Quantidade de despesas</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    {despesas.length}
                  </p>
                </div>
              </>
            )}

            {isOperationalAdminRole(roleUsuario) && (
              <>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Próprio</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.proprio.totalDespesas)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Debitado: R$ {formatarNumero(totais.proprio.totalDebitado)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Equipe</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.equipe.totalDespesas)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Debitado: R$ {formatarNumero(totais.equipe.totalDebitado)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Consolidado</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.consolidado.totalDespesas)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Debitado: R$ {formatarNumero(totais.consolidado.totalDebitado)}
                  </p>
                </div>
              </>
            )}

            {roleUsuario === "dono" && (
              <>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Total global de despesas</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.consolidado.totalDespesas)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Total global debitado</p>
                  <p className="mt-2 text-xl font-extrabold text-rose-600 md:text-2xl">
                    R$ {formatarNumero(totais.consolidado.totalDebitado)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 card-white-modern p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-600">Total no filtro atual</p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900 md:text-2xl">
                    R$ {formatarNumero(totais.filtrado.totalDespesas)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Debitado: R$ {formatarNumero(totais.filtrado.totalDebitado)}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {carregando && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 px-5 py-4 text-base text-slate-300">
                Carregando despesas...
              </div>
            )}

            {!carregando && despesasFiltradas.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1222]/70 px-5 py-4 text-base text-slate-300">
                Nenhuma despesa cadastrada neste período.
              </div>
            )}

            {!carregando &&
              despesasFiltradas.map((despesa) => {
                const valor = Number(despesa.valor ?? 0);
                const percentual = Number(despesa.percentual_desconto ?? 0);
                const desconto = valor * (percentual / 100);
                const estaEditando = despesaEditandoId === despesa.id;
                const userOwnerEditavel = roleUsuario === "auxiliar" ? ownerIdAuxiliar : userIdAtual;
                const podeEditarExcluir =
                  (Boolean(userOwnerEditavel) && despesa.user_id === userOwnerEditavel) ||
                  podeAdminGerenciarDespesa(despesa.user_id);

                return (
                  <div
                    key={despesa.id}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                  >
                    {estaEditando ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-600">
                              Nome
                            </label>
                            <input
                              value={editarDespesaNome}
                              onChange={(e) => setEditarDespesaNome(e.target.value)}
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-black"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-600">
                              Valor
                            </label>
                            <input
                              value={editarDespesaValor}
                              onChange={(e) => setEditarDespesaValor(e.target.value)}
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-black"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-600">
                              % debitada
                            </label>
                            <input
                              value={editarPercentualDesconto}
                              onChange={(e) => setEditarPercentualDesconto(e.target.value)}
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-black"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => salvarEdicaoDespesa(despesa.id)}
                            disabled={salvandoEdicao}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {salvandoEdicao ? "Salvando..." : "Salvar edição"}
                          </button>

                          <button
                            type="button"
                            onClick={cancelarEdicaoDespesa}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{despesa.nome}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              Dono da despesa: {obterLabelDono(despesa.user_id)}
                              {obterRoleDonoDespesa(despesa.user_id)
                                ? ` (${obterRoleDonoDespesa(despesa.user_id)})`
                                : ""}
                            </span>
                            <span className="text-sm text-slate-500">
                              Competência {MESES.find((m) => m.valor === despesa.mes)?.label}/
                              {despesa.ano}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 md:flex md:items-center md:gap-8">
                          <div>
                            <p className="text-sm text-slate-500">Valor</p>
                            <p className="text-sm font-bold text-slate-900">R$ {formatarNumero(valor)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">% débito</p>
                            <p className="text-sm font-bold text-slate-900">
                              {formatarNumero(percentual)}%
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Valor debitado</p>
                            <p className="text-sm font-bold text-rose-600">
                              R$ {formatarNumero(desconto)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {podeEditarExcluir && (
                            <button
                              type="button"
                              onClick={() => iniciarEdicaoDespesa(despesa)}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                            >
                              Editar
                            </button>
                          )}

                          {podeEditarExcluir && (
                            <button
                              type="button"
                              onClick={() => excluirDespesa(despesa.id)}
                              disabled={excluindoDespesaId === despesa.id}
                              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-60"
                            >
                              {excluindoDespesaId === despesa.id ? "Excluindo..." : "Excluir"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      </section>
    </main>
  );
}
