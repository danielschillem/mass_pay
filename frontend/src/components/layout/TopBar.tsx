"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const topbarRef = useRef<HTMLElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = mode === "admin";
  const initials = userName
    ? userName.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)
    : isAdmin ? "SA" : "AD";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;

    const syncTopbarHeight = () => {
      const height = Math.ceil(topbar.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-topbar-height", `${height}px`);
    };

    syncTopbarHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncTopbarHeight) : null;
    observer?.observe(topbar);
    window.addEventListener("resize", syncTopbarHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncTopbarHeight);
      document.documentElement.style.removeProperty("--app-topbar-height");
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin) {
          const r = await api.admin.tenants(1, 5, "kyb_pending");
          setNotifs(r.data.map((t) => ({
            id: t.id,
            label: t.raison_sociale,
            sub: "KYB en attente de validation",
            color: "var(--gold)",
            icon: <AlertTriangle size={14} />,
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
                icon: <AlertTriangle size={14} />,
                href: `/dashboard/batches/${b.id}` as Route,
              });
            } else if (b.status === "processing") {
              items.push({
                id: b.id,
                label: b.label,
                sub: "Virements en cours",
                color: "var(--gold)",
                icon: <RefreshCw size={14} />,
                href: `/dashboard/batches/${b.id}` as Route,
              });
            }
            if (items.length >= 5) break;
          }
          setNotifs(items);
        }
      } catch {
        /* notifications non bloquantes */
      }
    };
    load();
  }, [isAdmin]);

  return (
    <header ref={topbarRef} className="app-topbar">
      <div className="app-topbar-logo">
        <LogoMark />
      </div>

      <div className="app-topbar-mode" data-mode={mode}>
        {isAdmin ? <ShieldCheck size={14} /> : <Activity size={14} />}
        {isAdmin ? "Super Admin" : "Entreprise"}
      </div>

      <div className="app-topbar-search" aria-hidden="true">
        <Search size={15} />
        <span>{isAdmin ? "Rechercher un tenant, statut KYB ou admin" : "Rechercher un batch, bénéficiaire ou opération"}</span>
      </div>

      {!isAdmin && tenantName && (
        <div className="app-topbar-tenant" title={tenantName}>
          <Building2 size={14} color="var(--sub)" />
          <span className="truncate-text" style={{ fontWeight: 800, color: "var(--text)", fontSize: 12 }}>
            {tenantName}
          </span>
        </div>
      )}

      <div className="app-topbar-right">
        <div ref={ref} style={{ position: "relative" }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
            aria-expanded={open}
            title="Notifications"
            onClick={() => setOpen((v) => !v)}
          >
            <Bell size={16} />
            {notifs.length > 0 && <span className="notification-dot" />}
          </button>

          {open && (
            <div className="app-topbar-menu">
              <div className="topbar-menu-head">
                <span>Centre d&apos;activité</span>
                {notifs.length > 0 && <strong>{notifs.length}</strong>}
              </div>

              {notifs.length === 0 ? (
                <div className="topbar-empty">
                  <CheckCircle size={26} />
                  <strong>Tout est stable</strong>
                  <span>Aucune action urgente pour le moment.</span>
                </div>
              ) : (
                <div className="notif-list">
                  {notifs.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="notif-item"
                      onClick={() => {
                        setOpen(false);
                        router.push(n.href);
                      }}
                    >
                      <div
                        className="notif-icon"
                        style={{
                          color: n.color,
                          background: `color-mix(in srgb, ${n.color} 12%, transparent)`,
                          borderColor: `color-mix(in srgb, ${n.color} 22%, transparent)`,
                        }}
                      >
                        {n.icon}
                      </div>
                      <div className="notif-copy">
                        <strong>{n.label}</strong>
                        <span>{n.sub}</span>
                      </div>
                      <ExternalLink size={12} />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="notif-footer"
                onClick={() => {
                  setOpen(false);
                  router.push(isAdmin ? "/admin" : "/dashboard/batches");
                }}
              >
                {isAdmin ? "Ouvrir la supervision" : "Ouvrir l'historique"}
              </button>
            </div>
          )}
        </div>

        <div className="app-topbar-user">
          <div className="app-topbar-avatar">{initials}</div>
          <div className="app-topbar-user-meta">
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
              {userName ?? (isAdmin ? "Super Admin" : "Admin")}
            </div>
            <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>
              {userRole ?? "MynaPay BF"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
