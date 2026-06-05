type BadgeType =
  | "actif" | "active"
  | "kyb_pending"
  | "prospect"
  | "suspendu" | "suspended"
  | "terminé" | "completed"
  | "en_cours" | "processing"
  | "draft"
  | "validated"
  | "failed"
  | "salaire" | "prime" | "commission" | "autre"
  | "success" | "pending" | "retrying";

const MAP: Record<string, { label: string; bg: string; fg: string }> = {
  actif:       { label:"Actif",        bg:"rgba(13,201,138,.13)",  fg:"#0DC98A" },
  active:      { label:"Actif",        bg:"rgba(13,201,138,.13)",  fg:"#0DC98A" },
  kyb_pending: { label:"KYB en cours", bg:"rgba(228,167,48,.13)",  fg:"#E4A730" },
  prospect:    { label:"Prospect",     bg:"rgba(75,123,255,.13)",   fg:"#4B7BFF" },
  suspendu:    { label:"Suspendu",     bg:"rgba(240,82,82,.13)",    fg:"#F05252" },
  suspended:   { label:"Suspendu",     bg:"rgba(240,82,82,.13)",    fg:"#F05252" },
  terminé:     { label:"Terminé",      bg:"rgba(13,201,138,.13)",  fg:"#0DC98A" },
  completed:   { label:"Terminé",      bg:"rgba(13,201,138,.13)",  fg:"#0DC98A" },
  en_cours:    { label:"En cours",     bg:"rgba(75,123,255,.13)",   fg:"#4B7BFF" },
  processing:  { label:"En cours",     bg:"rgba(75,123,255,.13)",   fg:"#4B7BFF" },
  draft:       { label:"Brouillon",    bg:"rgba(152,165,196,.13)", fg:"#98A5C4" },
  validated:   { label:"Validé",       bg:"rgba(228,167,48,.13)",  fg:"#E4A730" },
  failed:      { label:"Échoué",       bg:"rgba(240,82,82,.13)",    fg:"#F05252" },
  salaire:     { label:"Salaire",      bg:"rgba(75,123,255,.13)",   fg:"#4B7BFF" },
  prime:       { label:"Prime",        bg:"rgba(228,167,48,.13)",  fg:"#E4A730" },
  commission:  { label:"Commission",   bg:"rgba(155,92,246,.13)",  fg:"#9B5CF6" },
  autre:       { label:"Autre",        bg:"rgba(152,165,196,.13)", fg:"#98A5C4" },
  success:     { label:"Succès",       bg:"rgba(13,201,138,.13)",  fg:"#0DC98A" },
  pending:     { label:"En attente",   bg:"rgba(152,165,196,.13)", fg:"#98A5C4" },
  retrying:    { label:"Retry",        bg:"rgba(228,167,48,.13)",  fg:"#E4A730" },
};

export function Badge({ type }: { type: BadgeType | string }) {
  const s = MAP[type] ?? { label: type, bg: "#172035", fg: "#98A5C4" };
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700,
      padding: "3px 9px", borderRadius: 20, letterSpacing: ".5px",
      textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
