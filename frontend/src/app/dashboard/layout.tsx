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
    <div className="app-shell" style={{ background:"var(--bg)", minHeight:"100vh",
      display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif" }}>
      <TopBar mode="tenant" tenantName={tenantName} userName={userName} userRole={userRole} />
      <div className="app-body" style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <Sidebar mode="tenant" />
        <main className="app-main" style={{ flex:1, overflow:"auto", padding:"26px 28px 38px",
          background:"linear-gradient(180deg,#F8FAFC 0%, var(--bg) 220px)" }}>
          <div className="app-content" style={{ maxWidth:1320, margin:"0 auto" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SplashLoader() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100vh",
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:36, height:36, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
