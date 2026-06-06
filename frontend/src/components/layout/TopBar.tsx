"use client";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { Bell, Building2, AlertTriangle, RefreshCw, CheckCircle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { LogoMark } from "./Sidebar";
import { api } from "@/lib/api";

interface TopBarProps {
  mode: "admin" | "tenant";
  tenantName?: string;
  userName?: string;
  userRole?: string;
}

type Notif = {
  id: string;
  label: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
  href: Route;
};

export function TopBar({ mode, tenantName, userName, userRole }: TopBarProps) {
  const router = useRouter();
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = mode === "admin";

  const initials = userName
    ? userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
    : isAdmin ? "SA" : "AD";

  // Fermer au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Charger les notifications
  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin) {
          const r = await api.admin.tenants(1, 5, "kyb_pending");
          setNotifs(r.data.map(t => ({
            id: t.id,
            label: t.raison_sociale,
            sub: "KYB en attente de validation",
            color: "var(--gold)",
            icon: <AlertTriangle size={13} />,
            href: `/admin/tenants/${t.id}` as Route,
          })));
        } else {
          const r = await api.tenant.batches(1, 20);
          const items: Notif[] = [];
          for (const b of r.data) {
            if (b.status === "failed") {
              items.push({
                id: b.id,
                label: b.label,
                sub: `${b.failure_count} virement(s) en échec`,
                color: "var(--red)",
                icon: <AlertTriangle size={13} />,
                href: `/dashboard/batches/${b.id}` as Route,
              });
            } else if (b.status === "processing") {
              items.push({
                id: b.id,
                label: b.label,
                sub: "Virements en cours…",
                color: "var(--gold)",
                icon: <RefreshCw size={13} />,
                href: `/dashboard/batches/${b.id}` as Route,
              });
            }
            if (items.length >= 5) break;
          }
          setNotifs(items);
        }
      } catch { /* silencieux */ }
    };
    load();
  }, [isAdmin]);

  return (
    <div className="app-topbar" style={{ background:"rgba(255,255,255,.90)", borderBottom:"1px solid var(--border)",
      padding:"0 24px", display:"flex", alignItems:"center",
      height:60, gap:14, flexShrink:0, position:"sticky", top:0, zIndex:100,
      backdropFilter:"blur(18px)", boxShadow:"0 10px 28px rgba(17,26,39,.045)" }}>
      <div className="app-topbar-logo"><LogoMark /></div>

      <div className="app-topbar-mode" style={{ background: isAdmin ? "var(--gold-sub)" : "var(--blue-sub)",
        border:`1px solid ${isAdmin ? "var(--gold-border)" : "var(--blue-border)"}`,
        borderRadius:999, padding:"5px 11px", fontSize:11, fontWeight:800,
        color: isAdmin ? "var(--gold-strong)" : "var(--blue)",
        textTransform:"uppercase", letterSpacing:".5px" }}>
        {isAdmin ? "Super Admin" : "Entreprise"}
      </div>

      {!isAdmin && tenantName && (
        <div className="app-topbar-tenant" style={{ display:"flex", alignItems:"center", gap:7,
          background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:999, padding:"6px 13px", fontSize:13, boxShadow:"var(--shadow-xs)" }}>
          <Building2 size={12} color="var(--sub)" />
          <span className="truncate-text" style={{ fontWeight:700, color:"var(--text)", fontSize:12 }}>{tenantName}</span>
        </div>
      )}

      <div className="app-topbar-right" style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>

        {/* Cloche + dropdown */}
        <div ref={ref} style={{ position:"relative" }}>
          <button type="button" onClick={() => setOpen(v => !v)}
            style={{ background: open ? "var(--elevated)" : "var(--card)",
              border:`1px solid ${open ? "var(--border)" : "var(--border)"}`,
              borderRadius:8, padding:"8px 10px", cursor:"pointer",
              position:"relative", display:"flex", alignItems:"center" }}>
            <Bell size={15} color={open ? "var(--gold)" : "var(--sub)"} />
            {notifs.length > 0 && (
              <div style={{ position:"absolute", top:5, right:5, width:7, height:7,
                borderRadius:"50%", background:"var(--red)",
                border:"2px solid var(--card)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:7, fontWeight:800, color:"#fff" }} />
            )}
          </button>

          {open && (
            <div className="app-topbar-menu" style={{ position:"absolute", right:0, top:"calc(100% + 8px)",
              width:320, background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, zIndex:200, overflow:"hidden",
              boxShadow:"var(--shadow)" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:13, fontFamily:"'Sora',sans-serif" }}>
                  Notifications
                </span>
                {notifs.length > 0 && (
                  <span style={{ background:"var(--red-sub-strong)", color:"var(--red)",
                    fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:8 }}>
                    {notifs.length}
                  </span>
                )}
              </div>

              {notifs.length === 0 ? (
                <div style={{ padding:"24px 16px", textAlign:"center" }}>
                  <CheckCircle size={24} color="var(--green)" style={{ marginBottom:8 }} />
                  <div style={{ color:"var(--sub)", fontSize:13 }}>Tout est en ordre</div>
                </div>
              ) : (
                <div>
                  {notifs.map(n => (
                    <button key={n.id} type="button"
                      onClick={() => { setOpen(false); router.push(n.href); }}
                      style={{ width:"100%", background:"transparent", border:"none",
                        borderBottom:"1px solid var(--border-soft)", padding:"13px 16px",
                        cursor:"pointer", display:"flex", alignItems:"center", gap:12,
                        textAlign:"left" as const }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--blue-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ width:30, height:30, borderRadius:7,
                        background:`color-mix(in srgb, ${n.color} 12%, transparent)`,
                        border:`1px solid color-mix(in srgb, ${n.color} 24%, transparent)`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        color:n.color, flexShrink:0 }}>
                        {n.icon}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:12, color:"var(--text)",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {n.label}
                        </div>
                        <div style={{ color:"var(--sub)", fontSize:11, marginTop:2 }}>{n.sub}</div>
                      </div>
                      <ExternalLink size={11} color="var(--sub)" />
                    </button>
                  ))}
                </div>
              )}

              <div style={{ padding:"10px 16px", borderTop:"1px solid var(--border)" }}>
                <button type="button"
                  onClick={() => { setOpen(false); router.push(isAdmin ? "/admin" : "/dashboard/batches"); }}
                  style={{ width:"100%", background:"none", border:"none",
                    color:"var(--blue)", fontSize:12, fontWeight:600, cursor:"pointer",
                    textAlign:"center" as const }}>
                  {isAdmin ? "Voir tous les tenants" : "Voir l'historique des batchs"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="app-topbar-user" style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ width:36, height:36,
            background: isAdmin ? "var(--gold-sub)" : "var(--blue-sub)",
            borderRadius:8, display:"flex", alignItems:"center",
            justifyContent:"center", fontWeight:800, fontSize:11,
            color: isAdmin ? "var(--gold-strong)" : "var(--blue)",
            border:`1px solid ${isAdmin ? "var(--gold-border)" : "var(--blue-border)"}` }}>
            {initials}
          </div>
          <div className="app-topbar-user-meta">
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", lineHeight:1.2 }}>
              {userName ?? (isAdmin ? "Super Admin" : "Admin")}
            </div>
            <div style={{ fontSize:10, color:"var(--sub)" }}>
              {userRole ?? "MynaPay BF"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
