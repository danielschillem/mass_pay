import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon, label, value, sub, color
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const fg = color ?? "var(--gold)";
  const bg = color ? `color-mix(in srgb, ${color} 12%, transparent)` : "var(--gold-sub)";
  return (
    <div style={{ background:"linear-gradient(180deg,#fff,var(--elevated))",
      border:"1px solid var(--border)", borderRadius:8,
      padding:"18px 20px", flex:1, minWidth:150, boxShadow:"var(--shadow-xs)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ color:"var(--sub)", fontSize:11, fontWeight:600, marginBottom:8,
            textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
          <div style={{ color:"var(--text)", fontSize:22, fontWeight:800,
            fontFamily:"'Sora',sans-serif" }}>{value}</div>
          {sub && <div style={{ color:"var(--sub)", fontSize:12, marginTop:4 }}>{sub}</div>}
        </div>
        <div style={{ background:bg, borderRadius:8, padding:10,
          border:`1px solid color-mix(in srgb, ${fg} 18%, transparent)` }}>
          <Icon size={18} color={fg} />
        </div>
      </div>
    </div>
  );
}

export function OpBadge({ op }: { op: string }) {
  const isOrange = op === "orange";
  return (
    <span style={{
      background: isOrange ? "rgba(255,140,0,.14)" : "var(--blue-sub)",
      color: isOrange ? "#FF8C00" : "var(--blue)",
      fontSize: 10, fontWeight: 700, padding: "2px 8px",
      borderRadius: 999, letterSpacing: ".5px", textTransform: "uppercase",
      border: `1px solid ${isOrange ? "rgba(255,140,0,.24)" : "var(--blue-border)"}`
    }}>
      {isOrange ? "Orange" : "Moov"}
    </span>
  );
}
