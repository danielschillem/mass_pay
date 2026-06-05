import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background:"#07090F", minHeight:"100vh",
      display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif" }}>
      <TopBar mode="admin" />
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <Sidebar mode="admin" />
        <main style={{ flex:1, overflow:"auto", padding:"28px 30px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
