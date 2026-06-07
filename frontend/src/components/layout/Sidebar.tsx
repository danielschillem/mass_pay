"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import type { ElementType } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronRight,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Send,
  Shield,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { auth } from "@/lib/api";

type NavItem = { href: Route; icon: ElementType; label: string };

const SA_NAV: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Vue globale" },
  { href: "/admin/tenants", icon: Building2, label: "Tenants" },
  { href: "/admin/kyb", icon: Shield, label: "KYB · Onboarding" },
  { href: "/admin/admins", icon: UserCog, label: "Administrateurs" },
];

const TENANT_NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
  { href: "/dashboard/batches/new", icon: Send, label: "Nouveau batch" },
  { href: "/dashboard/batches", icon: FileText, label: "Historique" },
  { href: "/dashboard/beneficiaries", icon: Users, label: "Bénéficiaires" },
  { href: "/dashboard/wallet", icon: Wallet, label: "Wallet" },
  { href: "/dashboard/users", icon: UserCog, label: "Mon équipe" },
];

export function Sidebar({ mode }: { mode: "admin" | "tenant" }) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = mode === "admin" ? SA_NAV : TENANT_NAV;
  const isAdmin = mode === "admin";

  const logout = () => {
    auth.clear();
    localStorage.removeItem("masspay_role");
    localStorage.removeItem("masspay_user");
    localStorage.removeItem("masspay_tenant_name");
    router.push("/login");
  };

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-logo">
        <LogoMark />
      </div>

      <div className="app-sidebar-context" aria-label="Contexte plateforme">
        <div className="app-sidebar-context-label">{isAdmin ? "Pilotage plateforme" : "Espace entreprise"}</div>
        <div className="app-sidebar-context-value">{isAdmin ? "Supervision globale" : "Paiements en masse"}</div>
      </div>

      <nav className="app-sidebar-nav" aria-label="Navigation principale">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin" && item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} title={item.label}>
              <div className={`app-sidebar-nav-item${active ? " is-active" : ""}`}>
                <item.icon size={16} strokeWidth={2.2} />
                <span className="app-sidebar-nav-label">{item.label}</span>
                {active && <ChevronRight className="app-sidebar-active-indicator" size={13} strokeWidth={2.4} />}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer">
        <div className="app-sidebar-session">
          <strong>{isAdmin ? "Console sécurisée" : "Session active"}</strong>
          <span>{isAdmin ? "KYB, tenants, liquidité" : "Wallet, batchs, bénéficiaires"}</span>
        </div>
        <button type="button" className="logout-btn" onClick={logout}>
          <LogOut size={15} />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}

export function LogoMark() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <Layers size={18} strokeWidth={2.4} />
      </div>
      <div className="brand-word">
        MynaPay <span>BF</span>
        <small>
          <BadgeCheck size={10} strokeWidth={2.4} aria-hidden="true" /> Fintech rails
        </small>
      </div>
    </div>
  );
}
