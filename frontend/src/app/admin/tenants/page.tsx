"use client";
import { useEffect, useState } from "react";
import { Search, Plus, Eye } from "lucide-react";
import { api } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.tenants(1, 50)
      .then(r => { setTenants(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter(t =>
    t.raison_sociale.toLowerCase().includes(search.toLowerCase()) ||
    t.ifu.includes(search)
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Tenants</h1>
          <p style={{ color:"#5A6888", fontSize:13, margin:"4px 0 0" }}>
            {total} entreprises enregistrées
          </p>
        </div>
        <button style={{ background:"#E4A730", color:"#000", border:"none",
          padding:"10px 18px", borderRadius:10, fontWeight:700, fontSize:13,
          cursor:"pointer", display:"flex", alignItems:"center", gap:6,
          fontFamily:"'Sora',sans-serif" }}>
          <Plus size={15} /> Nouveau tenant
        </button>
      </div>

      <div style={{ position:"relative", marginBottom:18 }}>
        <Search size={14} style={{ position:"absolute", left:14, top:"50%",
          transform:"translateY(-50%)", color:"#5A6888" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou IFU..."
          style={{ width:"100%", background:"#172035", border:"1px solid #1C2840",
            borderRadius:10, padding:"10px 14px 10px 38px", color:"#E4EAF8",
            fontSize:13, outline:"none", boxSizing:"border-box" as const }} />
      </div>

      <div style={{ background:"#111827", border:"1px solid #1C2840",
        borderRadius:14, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"#5A6888" }}>Chargement…</div> : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1C2840", background:"#0C1020" }}>
                {["Entreprise","IFU","Commission","Volume total","Statut","Action"].map(h => (
                  <th key={h} style={{ padding:"10px 18px", textAlign:"left",
                    color:"#5A6888", fontSize:10, fontWeight:700,
                    textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i<filtered.length-1 ? "1px solid rgba(28,40,64,.5)" : "none" }}>
                  <td style={{ padding:"13px 18px" }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{t.raison_sociale}</div>
                    <div style={{ color:"#5A6888", fontSize:11, marginTop:2 }}>{t.secteur}</div>
                  </td>
                  <td style={{ padding:"13px 18px", color:"#5A6888", fontSize:11,
                    fontFamily:"monospace" }}>{t.ifu}</td>
                  <td style={{ padding:"13px 18px", color:"#E4A730", fontSize:13, fontWeight:600 }}>
                    {(t.commission_rate * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding:"13px 18px", color:"#E4EAF8", fontSize:13, fontWeight:600 }}>
                    {t.wallet ? shortFcfa(t.wallet.total_debited) : "—"}
                  </td>
                  <td style={{ padding:"13px 18px" }}><Badge type={t.status} /></td>
                  <td style={{ padding:"13px 18px" }}>
                    <button style={{ background:"#172035", border:"1px solid #1C2840",
                      borderRadius:7, padding:"5px 10px", color:"#98A5C4", cursor:"pointer" }}>
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
