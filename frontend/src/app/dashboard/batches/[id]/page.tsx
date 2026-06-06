"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle, Clock, RefreshCw, Play, ShieldCheck, Download, AlertTriangle, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { Batch, BatchItem, BatchStatus, ItemStatus } from "@/lib/types";
import { fcfa } from "@/lib/types";

const BATCH_STATUS: Record<BatchStatus, { label: string; color: string }> = {
  draft:      { label: "Brouillon",   color: "var(--sub)" },
  validated:  { label: "Validé",      color: "var(--blue)" },
  processing: { label: "En cours",    color: "var(--gold)" },
  completed:  { label: "Terminé",     color: "var(--green)" },
  failed:     { label: "Échoué",      color: "var(--red)" },
};

const ITEM_STATUS: Record<ItemStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "En attente",  color: "var(--sub)",  icon: <Clock size={11} /> },
  success:  { label: "Succès",      color: "var(--green)",  icon: <CheckCircle size={11} /> },
  failed:   { label: "Échec",       color: "var(--red)",  icon: <XCircle size={11} /> },
  retrying: { label: "Relance",     color: "var(--gold)",  icon: <RefreshCw size={11} /> },
};

function exportItemsCSV(batch: Batch) {
  if (!batch.items || batch.items.length === 0) return;
  const headers = ["Nom","Téléphone","Opérateur","Montant","Statut","Tentatives","Ref Opérateur","Raison échec","Traité le"];
  const rows = batch.items.map(item => [
    item.full_name,
    item.phone_number,
    item.operator,
    item.amount,
    item.status,
    item.attempts,
    item.operator_ref ?? "",
    item.failure_reason ?? "",
    item.processed_at ? new Date(item.processed_at).toLocaleString("fr-FR") : "",
  ]);
  const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch_${batch.id.slice(0, 8)}_items.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [batch, setBatch]     = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [actLoading, setActLoading] = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  const load = () => {
    setLoading(true);
    api.tenant.getBatch(id)
      .then(setBatch)
      .catch(e => flash((e as Error).message, false))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const doValidate = async () => {
    if (!batch) return;
    setActLoading(true);
    try {
      const b = await api.tenant.validateBatch(batch.id);
      setBatch(b);
      flash("Batch validé avec succès");
    } catch (e: unknown) { flash((e as Error).message, false); }
    finally { setActLoading(false); }
  };

  const [showConfirmExec, setShowConfirmExec] = useState(false);

  const doExecute = async () => {
    if (!batch) return;
    setActLoading(true);
    setShowConfirmExec(false);
    try {
      const r = await api.tenant.executeBatch(batch.id);
      setBatch(r.batch);
      flash("Batch en cours d'exécution");
    } catch (e: unknown) { flash((e as Error).message, false); }
    finally { setActLoading(false); }
  };

  const doRetryFailed = async () => {
    if (!batch || !batch.items) return;
    setActLoading(true);
    try {
      for (const item of batch.items) {
        if (item.status === "failed") {
          await api.tenant.executeBatch(batch.id);
          break;
        }
      }
      flash("Tentative de relance des échecs initiée");
      load();
    } catch (e: unknown) { flash((e as Error).message, false); }
    finally { setActLoading(false); }
  };

  if (loading) return <PageSpinner />;
  if (!batch) return (
    <div style={{ color:"var(--red)", padding:40, textAlign:"center" }}>Batch introuvable</div>
  );

  const status = BATCH_STATUS[batch.status];
  const items: BatchItem[] = batch.items ?? [];
  const successRate = batch.item_count > 0
    ? Math.round((batch.success_count / batch.item_count) * 100)
    : 0;

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000,
          background: msg.ok ? "var(--green)" : "var(--red)",
          color: msg.ok ? "#fff" : "#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13 }}>
          {msg.text}
        </div>
      )}

      {/* Confirmation modal for execution */}
      {showConfirmExec && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
          display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirmExec(false); }}>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:440 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <AlertTriangle size={20} color="var(--gold)" />
              <h3 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
                Confirmer l&apos;exécution
              </h3>
            </div>
            <p style={{ color:"var(--mid)", fontSize:13, lineHeight:1.6, marginBottom:20 }}>
              Le montant de <b>{fcfa(batch.provision_amount)}</b> sera provisionné sur votre wallet.
              Cette action est irréversible.
            </p>
            <div style={{ background:"var(--surf)", borderRadius:8, padding:14, marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:"var(--sub)" }}>Masse à verser</span>
                <span style={{ fontSize:12, fontWeight:700 }}>{fcfa(batch.total_amount)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:"var(--sub)" }}>Commission</span>
                <span style={{ fontSize:12, fontWeight:700, color:"var(--gold)" }}>{fcfa(batch.commission_amount)}</span>
              </div>
              <div style={{ borderTop:"1px solid var(--border)", margin:"8px 0", paddingTop:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>Total provision</span>
                  <span style={{ fontSize:13, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>{fcfa(batch.provision_amount)}</span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button type="button" onClick={() => setShowConfirmExec(false)}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"9px 18px", borderRadius:9, cursor:"pointer",
                  fontSize:13, fontWeight:600 }}>Annuler</button>
              <button type="button" onClick={doExecute} disabled={actLoading}
                style={{ background:"var(--green)", color:"#fff", border:"none",
                  padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                  cursor: actLoading ? "not-allowed" : "pointer",
                  display:"flex", alignItems:"center", gap:6, opacity: actLoading ? .7 : 1 }}>
                <Play size={14} /> {actLoading ? "Exécution…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button type="button" onClick={() => router.back()} aria-label="Retour"
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8,
            padding:"7px 10px", cursor:"pointer", color:"var(--mid)" }}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>{batch.label}</h1>
          <p style={{ margin:"3px 0 0", color:"var(--sub)", fontSize:12 }}>
            {batch.type} · {new Date(batch.created_at).toLocaleDateString("fr-FR", { dateStyle:"long" })}
          </p>
        </div>
        <span style={{ background:`color-mix(in srgb, ${status.color} 12%, transparent)`, color:status.color,
          padding:"5px 14px", borderRadius:8, fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
          {status.label}
        </span>
        {batch.status === "draft" && (
          <button type="button" onClick={doValidate} disabled={actLoading}
            style={{ background:"var(--blue)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, cursor: actLoading ? "not-allowed" : "pointer",
              fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6,
              opacity: actLoading ? .7 : 1 }}>
            <ShieldCheck size={14} /> Valider
          </button>
        )}
        {batch.status === "validated" && (
          <button type="button" onClick={() => setShowConfirmExec(true)} disabled={actLoading}
            style={{ background:"var(--green)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, cursor: actLoading ? "not-allowed" : "pointer",
              fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6,
              opacity: actLoading ? .7 : 1 }}>
            <Play size={14} /> Exécuter
          </button>
        )}
        {batch.status === "failed" && items.filter(i => i.status === "failed").length > 0 && (
          <button type="button" onClick={doRetryFailed} disabled={actLoading}
            style={{ background:"var(--gold)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, cursor: actLoading ? "not-allowed" : "pointer",
              fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6,
              opacity: actLoading ? .7 : 1 }}>
            <RefreshCw size={14} /> Relancer les échecs
          </button>
        )}
        {items.length > 0 && (
          <button type="button" onClick={() => exportItemsCSV(batch)}
            style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
              padding:"9px 14px", borderRadius:9, cursor:"pointer",
              display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600 }}>
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="responsive-grid-auto" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:22 }}>
        {[
          { label:"Items",         val: batch.item_count,         color:"var(--mid)" },
          { label:"Réussis",       val: batch.success_count,      color:"var(--green)" },
          { label:"Échoués",       val: batch.failure_count,      color:"var(--red)" },
          { label:"Taux de succès",val: `${successRate}%`,        color: successRate >= 90 ? "var(--green)" : successRate >= 70 ? "var(--gold)" : "var(--red)" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"16px 18px" }}>
            <div style={{ color:"var(--sub)", fontSize:10, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".5px", marginBottom:6 }}>{label}</div>
            <div style={{ color, fontSize:22, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Montants */}
      <div className="responsive-grid-3" style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Masse salariale", val: batch.total_amount,      color:"var(--text)" },
          { label:"Commissions",     val: batch.commission_amount, color:"var(--gold)" },
          { label:"Provision totale",val: batch.provision_amount,  color:"var(--blue)" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"16px 18px" }}>
            <div style={{ color:"var(--sub)", fontSize:10, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".5px", marginBottom:6 }}>{label}</div>
            <div style={{ color, fontSize:18, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>{fcfa(val)}</div>
          </div>
        ))}
      </div>

      {/* Liste des items */}
      <div className="data-card" style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}>
          <span style={{ fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>
            Bénéficiaires · {items.length} lignes
          </span>
        </div>
        {items.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--sub)", fontSize:13 }}>
            Aucune ligne · données non encore chargées
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Nom","Téléphone","Opérateur","Montant","Statut","Tentatives","Ref / Raison"].map(h => (
                  <th key={h} style={{ padding:"9px 16px", textAlign:"left", color:"var(--sub)",
                    fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const st = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending;
                return (
                  <tr key={item.id}
                    style={{ borderBottom: i < items.length-1 ? "1px solid var(--border-soft)" : "none" }}>
                    <td style={{ padding:"11px 16px", fontWeight:600, fontSize:13 }}>{item.full_name}</td>
                    <td style={{ padding:"11px 16px", color:"var(--mid)", fontSize:12, fontFamily:"monospace" }}>
                      {item.phone_number}
                    </td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                        color: item.operator === "orange" ? "var(--gold)" : item.operator === "moov" ? "var(--blue)" : "var(--sub)" }}>
                        {item.operator}
                      </span>
                    </td>
                    <td style={{ padding:"11px 16px", fontWeight:700, fontSize:13 }}>{fcfa(item.amount)}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ background:`color-mix(in srgb, ${st.color} 12%, transparent)`, color:st.color,
                        fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:8,
                        display:"inline-flex", alignItems:"center", gap:4 }}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    <td style={{ padding:"11px 16px", color:"var(--sub)", fontSize:12, textAlign:"center" }}>
                      {item.attempts}
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:11, color:"var(--mid)", maxWidth:180, overflow:"hidden",
                      textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"monospace" }}>
                      {item.operator_ref || item.failure_reason || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PageSpinner() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"80px 0" }}>
      <div style={{ width:32, height:32, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
