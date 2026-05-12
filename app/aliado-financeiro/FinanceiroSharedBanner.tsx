type Props = {
  isSharedView: boolean;
  ownerNome: string;
  canEdit: boolean;
};

export default function FinanceiroSharedBanner({ isSharedView, ownerNome, canEdit }: Props) {
  if (!isSharedView) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Você está visualizando o financeiro compartilhado por <strong>{ownerNome}</strong>.{" "}
      {canEdit ? "Sua permissão permite editar lançamentos." : "Sua permissão é somente leitura."}
    </div>
  );
}
