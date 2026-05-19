type Props = {
  isSharedView: boolean;
  ownerNome: string;
  canEdit: boolean;
};

export default function FinanceiroSharedBanner({ isSharedView, ownerNome, canEdit }: Props) {
  if (!isSharedView) return null;
  void canEdit;

  return (
    <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Você está visualizando o Aliado Financeiro de <strong>{ownerNome}</strong>.
    </div>
  );
}
