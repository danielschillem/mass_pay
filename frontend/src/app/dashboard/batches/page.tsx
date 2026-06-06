"use client";
import { useEffect, useState } from "react";
import { Download, Filter, FileText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Batch, BatchStatus, BatchType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "Tous", value: "" },
  { label: "Brouillon", value: "draft" },
  { label: "Validé", value: "validated" },
  { label: "En cours", value: "processing" },
  { label: "Terminé", value: "completed" },
  { label: "Échoué", value: "failed" },
];

function exportCSV(batches: Batch[]) {
  const headers = ["Libellé","Type","Date","Bénéficiaires","Masse FCFA","Commission FCFA","Succès","Échecs","Statut"];
  const rows = batches.map(b => [
    `"${b.label}"`, b.type,
    new Date(b.created_at).toLocaleDateString("fr-FR"),
    b.item_count, b.total_amount, b.commission_amount,
    b.success_count, b.failure_count, b.status,
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

function exportPDF(batches: Batch[]) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const rows = batches.map(b => `<tr>
    <td style="padding:6px 10px;border:1px solid #ddd">${b.label}</td>
    <td style="padding:6px 10px;border:1px solid #ddd">${b.type}</td>
    <td style="padding:6px 10px;border:1px solid #ddd">${new Date(b.created_at).toLocaleDateString("fr-FR")}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${b.item_count}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${b.total_amount.toLocaleString("fr-FR")}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${b.commission_amount.toLocaleString("fr-FR")}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${b.success_count}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${b.failure_count}</td>
    <td style="padding:6px 10px;border:1px solid #ddd">${b.status}</td>
  </tr>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport MynaPay</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
    h1{font-size:16px;margin-bottom:4px}
    .sub{color:#666;font-size:11px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th{background:#f5f5f5;padding:8px 10px;border:1px solid #ddd;text-align:left;font-size:10px;text-transform:uppercase}
  </style></head><body>
    <h1>Rapport des batchs — MynaPay BF</h1>
    <div class="sub">Généré le ${new Date().toLocaleString("fr-FR")} · ${batches.length} batchs</div>
    <table><thead><tr>
      <th>Libellé</th><th>Type</th><th>Date</th><th>Nbre</th><th>Masse</th><th>Commission</th><th>Succès</th><th>Échecs</th><th>Statut</th>
    </tr></thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
  return true;
}

export default function BatchHistoryPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [msg, setMsg] = useState("");
  const pageSize = 15;

  const load = (p: number, status: string) => {
    setLoading(true);
    api.tenant.batches(p, pageSize)
      .then(r => { setBatches(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, statusFilter); }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  const filtered = batches.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false;
    if (searchTerm && !b.label.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000,
          background:"var(--red)", color:"#fff", padding:"12px 18px",
          borderRadius:8, fontSize:13, fontWeight:700 }}>
          {msg}
        </div>
      )}

      <div className="page-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Historique des batchs</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>{total} batchs au total</p>
        </div>
        <div className="page-actions" style={{ display:"flex", gap:8 }}>
          <button type="button" onClick={() => {
            const ok = exportPDF(filtered);
            if (!ok) {
              setMsg("Veuillez autoriser les pop-ups pour exporter le PDF");
              setTimeout(() => setMsg(""), 3000);
            }
          }} disabled={filtered.length === 0}
            style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
              padding:"9px 14px", borderRadius:9, fontWeight:600, fontSize:12,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
              opacity: filtered.length === 0 ? .5 : 1,
              display:"flex", alignItems:"center", gap:5 }}>
            <FileText size={13} /> PDF
          </button>
          <button type="button" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}
            style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
              padding:"9px 14px", borderRadius:9, fontWeight:600, fontSize:12,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
              opacity: filtered.length === 0 ? .5 : 1,
              display:"flex", alignItems:"center", gap:5 }}>
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:12, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:"absolute", left:12, top:"50%",
            transform:"translateY(-50%)", color:"var(--sub)" }} />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Rechercher un batch..."
            style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
              borderRadius:8, padding:"9px 12px 9px 34px", color:"var(--text)",
              fontSize:13, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {STATUS_FILTERS.map(sf => (
            <button key={sf.value} type="button" onClick={() => { setStatusFilter(sf.value); setPage(1); }}
              style={{ background: statusFilter === sf.value ? "var(--gold)" : "var(--elevated)",
                color: statusFilter === sf.value ? "#fff" : "var(--mid)",
                border: statusFilter === sf.value ? "none" : "1px solid var(--border)",
                borderRadius:7, padding:"6px 12px", fontSize:11, fontWeight:600,
                cursor:"pointer" }}>
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Loader /> : (
        <div className="data-card" style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding:"40px 20px", textAlign:"center",
                    color:"var(--sub)", fontSize:13 }}>
                    Aucun batch trouvé
                  </td>
                </tr>
              ) : filtered.map((b, i) => (
                <tr key={b.id}
                  onClick={() => router.push(`/dashboard/batches/${b.id}`)}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border-soft)" : "none",
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding:"14px 20px", borderTop:"1px solid var(--border)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:7, padding:"6px 10px", cursor:"pointer", color:"var(--mid)",
                  display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                <ChevronLeft size={13} /> Précédent
              </button>
              <span style={{ fontSize:12, color:"var(--sub)", margin:"0 8px" }}>
                Page {page} / {totalPages}
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:7, padding:"6px 10px", cursor:"pointer", color:"var(--mid)",
                  display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                Suivant <ChevronRight size={13} />
              </button>
            </div>
          )}
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
