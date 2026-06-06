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
  actif:       { label:"Actif",        bg:"var(--green-sub)",  fg:"var(--green)" },
  active:      { label:"Actif",        bg:"var(--green-sub)",  fg:"var(--green)" },
  kyb_pending: { label:"KYB en cours", bg:"var(--gold-sub)",  fg:"var(--gold)" },
  prospect:    { label:"Prospect",     bg:"var(--blue-sub)",   fg:"var(--blue)" },
  suspendu:    { label:"Suspendu",     bg:"var(--red-sub)",    fg:"var(--red)" },
  suspended:   { label:"Suspendu",     bg:"var(--red-sub)",    fg:"var(--red)" },
  terminé:     { label:"Terminé",      bg:"var(--green-sub)",  fg:"var(--green)" },
  completed:   { label:"Terminé",      bg:"var(--green-sub)",  fg:"var(--green)" },
  en_cours:    { label:"En cours",     bg:"var(--blue-sub)",   fg:"var(--blue)" },
  processing:  { label:"En cours",     bg:"var(--blue-sub)",   fg:"var(--blue)" },
  draft:       { label:"Brouillon",    bg:"var(--muted-sub)", fg:"var(--mid)" },
  validated:   { label:"Validé",       bg:"var(--gold-sub)",  fg:"var(--gold)" },
  failed:      { label:"Échoué",       bg:"var(--red-sub)",    fg:"var(--red)" },
  salaire:     { label:"Salaire",      bg:"var(--blue-sub)",   fg:"var(--blue)" },
  prime:       { label:"Prime",        bg:"var(--gold-sub)",  fg:"var(--gold)" },
  commission:  { label:"Commission",   bg:"var(--violet-sub)",  fg:"var(--violet)" },
  autre:       { label:"Autre",        bg:"var(--muted-sub)", fg:"var(--mid)" },
  success:     { label:"Succès",       bg:"var(--green-sub)",  fg:"var(--green)" },
  pending:     { label:"En attente",   bg:"var(--muted-sub)", fg:"var(--mid)" },
  retrying:    { label:"Retry",        bg:"var(--gold-sub)",  fg:"var(--gold)" },
};

export function Badge({ type }: { type: BadgeType | string }) {
  const s = MAP[type] ?? { label: type, bg: "var(--elevated)", fg: "var(--mid)" };
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700,
      padding: "3px 9px", borderRadius: 999, letterSpacing: ".5px",
      border: `1px solid color-mix(in srgb, ${s.fg} 24%, transparent)`,
      textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
