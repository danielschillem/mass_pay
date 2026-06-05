"use client";
import { Bell, Building2 } from "lucide-react";
import { LogoMark } from "./Sidebar";

interface TopBarProps {
  mode: "admin" | "tenant";
  tenantName?: string;
  userName?: string;
  userRole?: string;
}

export function TopBar({ mode, tenantName, userName, userRole }: TopBarProps) {
  const initials = userName
    ? userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
    : mode === "admin" ? "SA" : "AD";

  const isAdmin = mode === "admin";

  return (
    <div style={{ background:"#0C1020", borderBottom:"1px solid #1C2840",
      padding:"0 22px", display:"flex", alignItems:"center",
      height:54, gap:16, flexShrink:0 }}>
      <LogoMark />

      {/* Badge mode */}
      <div style={{ background:"#111827", border:"1px solid #1C2840",
        borderRadius:9, padding:"4px 12px", fontSize:11, fontWeight:700,
        color: isAdmin ? "#E4A730" : "#4B7BFF",
        textTransform:"uppercase", letterSpacing:".5px" }}>
        {isAdmin ? "Super Admin" : "Entreprise"}
      </div>

      {!isAdmin && tenantName && (
        <div style={{ display:"flex", alignItems:"center", gap:7,
          background:"#111827", border:"1px solid #1C2840",
          borderRadius:9, padding:"5px 14px", fontSize:13 }}>
          <Building2 size={12} color="#5A6888" />
          <span style={{ fontWeight:700, color:"#E4EAF8", fontSize:12 }}>{tenantName}</span>
        </div>
      )}

      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
        <button style={{ background:"#111827", border:"1px solid #1C2840",
          borderRadius:8, padding:"6px 9px", cursor:"pointer",
          position:"relative", display:"flex", alignItems:"center" }}>
          <Bell size={15} color="#5A6888" />
          <div style={{ position:"absolute", top:5, right:5, width:6, height:6,
            borderRadius:"50%", background:"#F05252",
            border:"2px solid #0C1020" }} />
        </button>

        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ width:32, height:32,
            background: isAdmin ? "rgba(228,167,48,.13)" : "rgba(75,123,255,.13)",
            borderRadius:"50%", display:"flex", alignItems:"center",
            justifyContent:"center", fontWeight:800, fontSize:11,
            color: isAdmin ? "#E4A730" : "#4B7BFF",
            border:`1px solid ${isAdmin ? "rgba(228,167,48,.3)" : "rgba(75,123,255,.3)"}` }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#E4EAF8", lineHeight:1.2 }}>
              {userName ?? (isAdmin ? "Super Admin" : "Admin")}
            </div>
            <div style={{ fontSize:10, color:"#5A6888" }}>
              {userRole ?? "MassPay BF"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
