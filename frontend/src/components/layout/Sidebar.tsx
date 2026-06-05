"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText,
  Send, LogOut, Building2, Shield,
  Layers, ChevronRight
} from "lucide-react";
import { auth } from "@/lib/api";

type NavItem = { href: Route; icon: React.ElementType; label: string };

const SA_NAV: NavItem[] = [
  { href:"/admin",          icon:LayoutDashboard, label:"Vue globale"      },
  { href:"/admin/tenants",  icon:Building2,        label:"Tenants"          },
  { href:"/admin/kyb",      icon:Shield,           label:"KYB · Onboarding" },
];

const TENANT_NAV: NavItem[] = [
  { href:"/dashboard",                icon:LayoutDashboard, label:"Tableau de bord" },
  { href:"/dashboard/batches/new",    icon:Send,             label:"Nouveau batch"   },
  { href:"/dashboard/batches",        icon:FileText,         label:"Historique"      },
  { href:"/dashboard/beneficiaries",  icon:Users,            label:"Bénéficiaires"   },
];

export function Sidebar({ mode }: { mode: "admin" | "tenant" }) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = mode === "admin" ? SA_NAV : TENANT_NAV;

  const logout = () => {
    auth.clear();
    localStorage.removeItem("masspay_role");
    localStorage.removeItem("masspay_user");
    router.push("/login");
  };

  return (
    <div style={{ width:220, background:"#0C1020", borderRight:"1px solid #1C2840",
      padding:"18px 10px", display:"flex", flexDirection:"column",
      flexShrink:0, height:"100%", fontFamily:"'DM Sans',sans-serif" }}>
      {nav.map(item => {
        const active = pathname === item.href || (item.href !== "/admin" && item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
              borderRadius:9, marginBottom:2,
              background: active ? "rgba(228,167,48,.13)" : "transparent",
              border: `1px solid ${active ? "rgba(228,167,48,.28)" : "transparent"}`,
              color: active ? "#E4A730" : "#5A6888",
              fontWeight: active ? 600 : 400, fontSize:13, cursor:"pointer",
              transition:"all .15s" }}>
              <item.icon size={15} style={{ flexShrink:0 }} />
              <span>{item.label}</span>
              {active && <ChevronRight size={12} style={{ marginLeft:"auto" }} />}
            </div>
          </Link>
        );
      })}

      <div style={{ marginTop:"auto", paddingTop:14,
        borderTop:"1px solid rgba(28,40,64,.6)" }}>
        <button onClick={logout} style={{ display:"flex", alignItems:"center", gap:10,
          padding:"9px 12px", borderRadius:9, color:"#5A6888", fontWeight:400,
          fontSize:13, cursor:"pointer", background:"transparent", border:"none",
          width:"100%", fontFamily:"'DM Sans',sans-serif" }}>
          <LogOut size={14} /> Déconnexion
        </button>
      </div>
    </div>
  );
}

export function LogoMark() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9,
      fontFamily:"'Sora',sans-serif", fontWeight:800, fontSize:17,
      color:"#E4EAF8", userSelect:"none" }}>
      <div style={{ width:30, height:30, background:"#E4A730", borderRadius:8,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Layers size={16} color="#000" />
      </div>
      MassPay<span style={{ color:"#E4A730" }}>BF</span>
    </div>
  );
}
