"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady]       = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    // 1. Pas de token → login
    if (!auth.isLoggedIn()) {
      router.replace("/login");
      return;
    }
    // 2. Seul le super_admin accède à /admin
    const role = localStorage.getItem("masspay_role") ?? "";
    if (role !== "super_admin") {
      router.replace("/dashboard");
      return;
    }
    // 3. Lire les infos utilisateur
    try {
      const raw = localStorage.getItem("masspay_user");
      const u   = raw ? JSON.parse(raw) : {};
      setUserName(u.full_name || u.email || "Super Admin");
    } catch { /* localStorage corrompu */ }
    setReady(true);
  }, [router]);

  if (!ready) return <SplashLoader />;

  return (
    <div style={{ background:"var(--bg)", minHeight:"100vh",
      display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif" }}>
      <TopBar mode="admin" userName={userName} />
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <Sidebar mode="admin" />
        <main style={{ flex:1, overflow:"auto", padding:"28px 30px 40px" }}>
          <div style={{ maxWidth:1280, margin:"0 auto" }}>
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
