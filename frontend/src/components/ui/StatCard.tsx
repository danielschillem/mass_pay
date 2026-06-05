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
  const fg = color ?? "#E4A730";
  const bg = color ? `${color}18` : "rgba(228,167,48,.13)";
  return (
    <div style={{ background:"#111827", border:"1px solid #1C2840", borderRadius:14,
      padding:"20px 22px", flex:1, minWidth:150 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ color:"#5A6888", fontSize:11, fontWeight:600, marginBottom:8,
            textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
          <div style={{ color:"#E4EAF8", fontSize:22, fontWeight:800,
            fontFamily:"'Sora',sans-serif" }}>{value}</div>
          {sub && <div style={{ color:"#5A6888", fontSize:12, marginTop:4 }}>{sub}</div>}
        </div>
        <div style={{ background:bg, borderRadius:10, padding:10 }}>
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
      background: isOrange ? "rgba(255,140,0,.14)" : "rgba(75,123,255,.14)",
      color: isOrange ? "#FF8C00" : "#4B7BFF",
      fontSize: 10, fontWeight: 700, padding: "2px 8px",
      borderRadius: 12, letterSpacing: ".5px", textTransform: "uppercase"
    }}>
      {isOrange ? "Orange" : "Moov"}
    </span>
  );
}
