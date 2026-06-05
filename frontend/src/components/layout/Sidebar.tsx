"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText,
  Send, LogOut, Building2, Shield,
  Layers, ChevronRight, Wallet, UserCog
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
  { href:"/dashboard/wallet",         icon:Wallet,           label:"Wallet"          },
  { href:"/dashboard/users",          icon:UserCog,          label:"Mon équipe"      },
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
    <div style={{ width:248, background:"var(--surf)", borderRight:"1px solid var(--border)",
      padding:"18px 14px", display:"flex", flexDirection:"column",
      flexShrink:0, height:"100%", fontFamily:"'DM Sans',sans-serif",
      boxShadow:"12px 0 30px rgba(15,23,42,.04)", backdropFilter:"blur(16px)" }}>
      <div style={{ display:"none" }}>
        <LogoMark />
      </div>
      {nav.map(item => {
        const active = pathname === item.href || (item.href !== "/admin" && item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 12px",
              borderRadius:10, marginBottom:4,
              background: active ? "var(--gold-sub)" : "transparent",
              border: `1px solid ${active ? "var(--gold-border)" : "transparent"}`,
              color: active ? "var(--gold)" : "var(--mid)",
              fontWeight: active ? 700 : 500, fontSize:13, cursor:"pointer",
              transition:"all .15s", boxShadow: active ? "0 8px 22px rgba(199,131,18,.10)" : "none" }}>
              <item.icon size={15} style={{ flexShrink:0 }} />
              <span>{item.label}</span>
              {active && <ChevronRight size={12} style={{ marginLeft:"auto" }} />}
            </div>
          </Link>
        );
      })}

      <div style={{ marginTop:"auto", paddingTop:14,
        borderTop:"1px solid var(--border-soft)" }}>
        <button onClick={logout} style={{ display:"flex", alignItems:"center", gap:10,
          padding:"11px 12px", borderRadius:10, color:"var(--sub)", fontWeight:600,
          fontSize:13, cursor:"pointer", background:"var(--elevated)", border:"1px solid var(--border)",
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
      color:"var(--text)", userSelect:"none" }}>
      <div style={{ width:32, height:32, background:"linear-gradient(135deg,var(--gold),#EAB308)", borderRadius:10,
        display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 10px 22px rgba(199,131,18,.22)" }}>
        <Layers size={16} color="#fff" />
      </div>
      MynaPay<span style={{ color:"var(--gold)" }}>BF</span>
    </div>
  );
}
