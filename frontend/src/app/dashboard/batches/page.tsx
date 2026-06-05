"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

function exportCSV(batches: Batch[]) {
  const headers = ["Libellé","Type","Date","Bénéficiaires","Masse FCFA","Commission FCFA","Succès","Échecs","Statut"];
  const rows = batches.map(b => [
    `"${b.label}"`,
    b.type,
    new Date(b.created_at).toLocaleDateString("fr-FR"),
    b.item_count,
    b.total_amount,
    b.commission_amount,
    b.success_count,
    b.failure_count,
    b.status,
  ]);
  const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `mynapay-batchs-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchHistoryPage() {
  const router = useRouter();
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
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Historique des batchs</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>{total} batchs au total</p>
        </div>
        <button type="button"
          onClick={() => exportCSV(batches)}
          disabled={batches.length === 0}
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
            padding:"9px 16px", borderRadius:9, fontWeight:600, fontSize:13,
            cursor: batches.length === 0 ? "not-allowed" : "pointer",
            opacity: batches.length === 0 ? .5 : 1,
            display:"flex", alignItems:"center", gap:6 }}>
          <Download size={13} /> Exporter CSV
        </button>
      </div>

      {loading ? <Loader /> : (
        <div style={{ background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:14, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Libellé","Type","Date","Bénéficiaires","Masse","Commission","Résultats","Statut"].map(h => (
                  <th key={h} style={{ padding:"10px 16px", textAlign:"left",
                    color:"var(--sub)", fontSize:10, fontWeight:700,
                    textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding:"40px 20px", textAlign:"center",
                    color:"var(--sub)", fontSize:13 }}>
                    Aucun batch · créez votre premier virement en masse
                  </td>
                </tr>
              ) : batches.map((b, i) => (
                <tr key={b.id}
                  onClick={() => router.push(`/dashboard/batches/${b.id}`)}
                  style={{ borderBottom: i < batches.length - 1 ? "1px solid var(--border-soft)" : "none",
                    cursor:"pointer", transition:"background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--blue-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td style={{ padding:"13px 16px", fontWeight:700, fontSize:13 }}>{b.label}</td>
                  <td style={{ padding:"13px 16px" }}><Badge type={b.type} /></td>
                  <td style={{ padding:"13px 16px", color:"var(--mid)", fontSize:12 }}>
                    {new Date(b.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td style={{ padding:"13px 16px", color:"var(--text)", fontSize:13 }}>{b.item_count}</td>
                  <td style={{ padding:"13px 16px", color:"var(--text)", fontWeight:700, fontSize:13 }}>
                    {shortFcfa(b.total_amount)}
                  </td>
                  <td style={{ padding:"13px 16px", color:"var(--gold)", fontWeight:700, fontSize:13 }}>
                    {shortFcfa(b.commission_amount)}
                  </td>
                  <td style={{ padding:"13px 16px" }}>
                    <span style={{ color:"var(--green)", fontSize:12, fontWeight:700 }}>{b.success_count} ok</span>
                    {b.failure_count > 0 && (
                      <span style={{ color:"var(--red)", fontSize:12, fontWeight:700, marginLeft:7 }}>
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
      <div style={{ width:24, height:24, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
