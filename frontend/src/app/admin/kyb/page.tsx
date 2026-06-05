"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Check, X, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export default function KYBPage() {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    api.admin.tenants(1, 50, "kyb_pending")
      .then(r => setTenants(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const activate = async (t: Tenant) => {
    setActivating(s => new Set([...s, t.id]));
    try {
      await api.admin.activate(t.id);
      setTenants(ts => ts.filter(x => x.id !== t.id));
      flash(`${t.raison_sociale} activé avec succès`);
    } catch (e: unknown) {
      setActivating(s => { const n = new Set(s); n.delete(t.id); return n; });
      flash((e as Error).message);
    }
  };

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:10, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {msg}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>KYB · Onboarding</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>
            Validation des dossiers entreprises en attente
          </p>
        </div>
        <button type="button" onClick={load}
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
            padding:"9px 14px", borderRadius:9, cursor:"pointer", display:"flex",
            alignItems:"center", gap:6, fontSize:13, fontWeight:600 }}>
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", paddingTop:60 }}>
          <div style={{ width:24, height:24, border:"3px solid var(--gold)",
            borderTopColor:"transparent", borderRadius:"50%",
            animation:"spin .8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : tenants.length === 0 ? (
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14,
          padding:"48px 24px", textAlign:"center", color:"var(--sub)", fontSize:14 }}>
          <Check size={32} style={{ color:"var(--green)", marginBottom:12 }} />
          <div>Aucun dossier en attente de validation KYB</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {tenants.map(t => {
            const done = activating.has(t.id);
            return (
              <div key={t.id} style={{ background:"var(--card)",
                border:`1px solid ${done ? "var(--green-border)" : "var(--border)"}`,
                borderRadius:14, padding:24, transition:"border-color .3s" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:18 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:17, fontFamily:"'Sora',sans-serif" }}>
                      {t.raison_sociale}
                    </div>
                    <div style={{ color:"var(--sub)", fontSize:12, marginTop:5,
                      display:"flex", gap:16, flexWrap:"wrap" as const }}>
                      <span>IFU : {t.ifu}</span>
                      <span>RCCM : {t.rccm}</span>
                      {t.secteur && <span>Secteur : {t.secteur}</span>}
                      <span>Soumis le {new Date(t.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    {!done ? (
                      <button type="button" onClick={() => activate(t)}
                        style={{ background:"var(--green)", color:"#fff", border:"none",
                          padding:"9px 18px", borderRadius:9, fontWeight:700,
                          fontSize:13, cursor:"pointer", display:"flex",
                          alignItems:"center", gap:7 }}>
                        <CheckCircle2 size={15} /> Valider et activer
                      </button>
                    ) : (
                      <div style={{ background:"var(--green-sub)", color:"var(--green)",
                        padding:"9px 18px", borderRadius:9, fontWeight:700, fontSize:13,
                        display:"flex", alignItems:"center", gap:7 }}>
                        <Check size={14} /> Tenant activé
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize:11, color:"var(--sub)", fontWeight:700,
                  textTransform:"uppercase", letterSpacing:".4px", marginBottom:10 }}>
                  Informations
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                  {[
                    { label: "Raison sociale", ok: !!t.raison_sociale },
                    { label: "IFU", ok: !!t.ifu },
                    { label: "RCCM", ok: !!t.rccm },
                    { label: "Secteur", ok: !!t.secteur },
                  ].map(({ label, ok }) => (
                    <span key={label} style={{
                      background: ok ? "var(--green-sub)" : "var(--red-sub)",
                      color: ok ? "var(--green)" : "var(--red)",
                      fontSize:12, padding:"4px 12px", borderRadius:20,
                      display:"flex", alignItems:"center", gap:5, fontWeight:600 }}>
                      {ok ? <Check size={11} /> : <X size={11} />} {label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
