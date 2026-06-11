import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const fg = color ?? "var(--green)";
  const style = { "--stat-color": fg } as CSSProperties;

  return (
    <div className="stat-card" style={style}>
      <div className="stat-card-inner">
        <div>
          <div className="stat-card-label">{label}</div>
          <div className="stat-card-value">{value}</div>
          {sub && <div className="stat-card-sub">{sub}</div>}
        </div>
        <div className="stat-card-icon">
          <Icon size={18} strokeWidth={2.2} />
        </div>
      </div>
    </div>
  );
}

export function OpBadge({ op }: { op: string }) {
  const isOrange = op === "orange";
  const isMoov = op === "moov";
  const style = {
    "--badge-bg": isOrange ? "rgba(255, 140, 0, .14)" : isMoov ? "var(--blue-sub)" : "var(--elevated)",
    "--badge-fg": isOrange ? "#e87800" : isMoov ? "var(--blue)" : "var(--sub)",
  } as CSSProperties;

  return (
    <span className="badge" style={style}>
      {isOrange ? "Orange" : isMoov ? "Moov" : "–"}
    </span>
  );
}
