"use client";
import { useEffect, useState } from "react";
import { Search, Plus, Upload, Eye, Settings } from "lucide-react";
import { api } from "@/lib/api";
import type { Beneficiary } from "@/lib/types";
import { OpBadge } from "@/components/ui/StatCard";

export default function BeneficiariesPage() {
  const [benefs, setBenefs] = useState<Beneficiary[]>([]);
  const [total, setTotal]   = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (q = "") => {
    setLoading(true);
    api.tenant.beneficiaries(1, 100, q)
      .then(r => { setBenefs(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Bénéficiaires</h1>
          <p style={{ color:"#5A6888", fontSize:13, margin:"4px 0 0" }}>
            Annuaire · {total} contacts
          </p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button style={{ background:"#172035", border:"1px solid #1C2840",
            color:"#98A5C4", padding:"9px 16px", borderRadius:9, fontWeight:600,
            fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <Upload size={13} /> Importer CSV
          </button>
          <button style={{ background:"#E4A730", color:"#000", border:"none",
            padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Sora',sans-serif" }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div style={{ position:"relative", marginBottom:16 }}>
        <Search size={14} style={{ position:"absolute", left:14, top:"50%",
          transform:"translateY(-50%)", color:"#5A6888" }} />
        <input value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value); }}
          placeholder="Rechercher par nom ou numéro..."
          style={{ width:"100%", background:"#172035", border:"1px solid #1C2840",
            borderRadius:10, padding:"10px 14px 10px 38px", color:"#E4EAF8",
            fontSize:13, outline:"none", boxSizing:"border-box" as const }} />
      </div>

      <div style={{ background:"#111827", border:"1px solid #1C2840",
        borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #1C2840", background:"#0C1020" }}>
              {["Nom","Téléphone","Opérateur","Groupe","Montant habituel","Actions"].map(h => (
                <th key={h} style={{ padding:"10px 20px", textAlign:"left",
                  color:"#5A6888", fontSize:10, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding:"40px", textAlign:"center" }}><Loader /></td></tr>
            ) : benefs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding:"40px", textAlign:"center",
                  color:"#5A6888", fontSize:13 }}>
                  Aucun bénéficiaire — commencez par ajouter ou importer une liste
                </td>
              </tr>
            ) : benefs.map((b, i) => (
              <tr key={b.id} style={{ borderBottom: i<benefs.length-1 ? "1px solid rgba(28,40,64,.5)" : "none" }}>
                <td style={{ padding:"13px 20px", fontWeight:700, fontSize:13 }}>{b.full_name}</td>
                <td style={{ padding:"13px 20px", color:"#98A5C4", fontSize:12 }}>{b.phone_number}</td>
                <td style={{ padding:"13px 20px" }}><OpBadge op={b.operator} /></td>
                <td style={{ padding:"13px 20px", color:"#98A5C4", fontSize:12 }}>{b.group_name || "—"}</td>
                <td style={{ padding:"13px 20px", color:"#E4EAF8", fontWeight:700, fontSize:13 }}>
                  {b.default_amount > 0 ? b.default_amount.toLocaleString("fr-FR") + " F" : "—"}
                </td>
                <td style={{ padding:"13px 20px" }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={{ background:"#172035", border:"1px solid #1C2840",
                      borderRadius:7, padding:"5px 10px", color:"#98A5C4", cursor:"pointer" }}>
                      <Eye size={12} />
                    </button>
                    <button style={{ background:"#172035", border:"1px solid #1C2840",
                      borderRadius:7, padding:"5px 10px", color:"#98A5C4", cursor:"pointer" }}>
                      <Settings size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"20px 0" }}>
      <div style={{ width:22, height:22, border:"3px solid #E4A730",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
