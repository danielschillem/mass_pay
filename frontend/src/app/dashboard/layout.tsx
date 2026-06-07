"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady]           = useState(false);
  const [userName, setUserName]     = useState("");
  const [userRole, setUserRole]     = useState("");
  const [tenantName, setTenantName] = useState("");

  useEffect(() => {
    // 1. Pas de token → login
    if (!auth.isLoggedIn()) {
      router.replace("/login");
      return;
    }
    // 2. Super admin ne doit pas être ici
    const role = localStorage.getItem("masspay_role") ?? "";
    if (role === "super_admin") {
      router.replace("/admin");
      return;
    }
    // 3. Lire les infos utilisateur
    try {
      const raw = localStorage.getItem("masspay_user");
      const u   = raw ? JSON.parse(raw) : {};
      setUserName(u.full_name || u.email || "");
      setUserRole(role);
    } catch { /* localStorage corrompu */ }
    setTenantName(localStorage.getItem("masspay_tenant_name") || "Mon espace");
    setReady(true);
  }, [router]);

  if (!ready) return <SplashLoader />;

  return (
    <div className="app-shell">
      <TopBar mode="tenant" tenantName={tenantName} userName={userName} userRole={userRole} />
      <div className="app-body">
        <Sidebar mode="tenant" />
        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SplashLoader() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div className="spinner" />
    </div>
  );
}
