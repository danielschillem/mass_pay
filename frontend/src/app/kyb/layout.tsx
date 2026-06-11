"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { LogoMark } from "@/components/layout/Sidebar";

export default function KYBLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const role = localStorage.getItem("masspay_role") ?? "";
    if (role === "super_admin") {
      router.replace("/admin");
    }
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{
        height: 56, borderBottom: "1px solid var(--border)",
        background: "var(--card)", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 12,
      }}>
        <LogoMark />
        <span style={{ fontSize: 13, color: "var(--sub)", fontWeight: 600 }}>
          Vérification KYB
        </span>
      </header>
      <main style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
        {children}
      </main>
    </div>
  );
}
