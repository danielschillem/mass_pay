"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

export default function BatchHistoryPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tenant.batches(1, 50)
      .then(r => { setBatches(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Historique des batchs</h1>
          <p style={{ color:"#5A6888", fontSize:13, margin:"4px 0 0" }}>{total} batchs au total</p>
        </div>
        <button style={{ background:"#172035", border:"1px solid #1C2840", color:"#98A5C4",
          padding:"9px 16px", borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer",
          display:"flex", alignItems:"center", gap:6 }}>
          <Download size={13} /> Exporter
        </button>
      </div>

      {loading ? <Loader /> : (
        <div style={{ background:"#111827", border:"1px solid #1C2840",
          borderRadius:14, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1C2840", background:"#0C1020" }}>
                {["Libellé","Type","Date","Bénéficiaires","Masse","Commission","Résultats","Statut"].map(h => (
                  <th key={h} style={{ padding:"10px 16px", textAlign:"left",
                    color:"#5A6888", fontSize:10, fontWeight:700,
                    textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding:"40px 20px", textAlign:"center",
                    color:"#5A6888", fontSize:13 }}>
                    Aucun batch — créez votre premier virement en masse
                  </td>
                </tr>
              ) : batches.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: i<batches.length-1 ? "1px solid rgba(28,40,64,.5)" : "none" }}>
                  <td style={{ padding:"13px 16px", fontWeight:700, fontSize:13 }}>{b.label}</td>
                  <td style={{ padding:"13px 16px" }}><Badge type={b.type} /></td>
                  <td style={{ padding:"13px 16px", color:"#98A5C4", fontSize:12 }}>
                    {new Date(b.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td style={{ padding:"13px 16px", color:"#E4EAF8", fontSize:13 }}>{b.item_count}</td>
                  <td style={{ padding:"13px 16px", color:"#E4EAF8", fontWeight:700, fontSize:13 }}>
                    {shortFcfa(b.total_amount)}
                  </td>
                  <td style={{ padding:"13px 16px", color:"#E4A730", fontWeight:700, fontSize:13 }}>
                    {shortFcfa(b.commission_amount)}
                  </td>
                  <td style={{ padding:"13px 16px" }}>
                    <span style={{ color:"#0DC98A", fontSize:12, fontWeight:700 }}>{b.success_count} ok</span>
                    {b.failure_count > 0 && (
                      <span style={{ color:"#F05252", fontSize:12, fontWeight:700, marginLeft:7 }}>
                        {b.failure_count} éch.
                      </span>
                    )}
                  </td>
                  <td style={{ padding:"13px 16px" }}><Badge type={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display:"flex", justifyContent:"center", paddingTop:60 }}>
      <div style={{ width:24, height:24, border:"3px solid #E4A730",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
