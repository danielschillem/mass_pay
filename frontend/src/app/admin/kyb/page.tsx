"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RefreshCw, ExternalLink, Search, ShieldCheck, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export default function KYBPage() {
  const router = useRouter();
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api.admin.tenants(1, 50, "kyb_pending")
      .then(r => setTenants(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const filtered = tenants.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.raison_sociale, t.ifu, t.rccm, t.secteur, t.slug]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  });

  const completeInfo = tenants.filter(t => t.raison_sociale && t.ifu && t.rccm && t.secteur).length;
  const incompleteInfo = tenants.length - completeInfo;

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {msg}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>KYB · Onboarding</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>
            {filtered.length} dossier{filtered.length !== 1 ? "s" : ""} à instruire sur {tenants.length}
          </p>
        </div>
        <button type="button" onClick={load}
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
            padding:"9px 14px", borderRadius:9, cursor:"pointer", display:"flex",
            alignItems:"center", gap:6, fontSize:13, fontWeight:600 }}>
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:12, marginBottom:16 }}>
        {[
          { label:"Dossiers en attente", value:tenants.length, icon:<ShieldCheck size={16} color="var(--gold)" />, color:"var(--gold)" },
          { label:"Identité complète", value:completeInfo, icon:<Check size={16} color="var(--green)" />, color:"var(--green)" },
          { label:"À compléter", value:incompleteInfo, icon:<AlertTriangle size={16} color="var(--red)" />, color:"var(--red)" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:8, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:8, background:`color-mix(in srgb, ${color} 12%, transparent)`,
              border:`1px solid color-mix(in srgb, ${color} 24%, transparent)`, display:"flex",
              alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {icon}
            </div>
            <div>
              <div style={{ color:"var(--sub)", fontSize:10, fontWeight:800,
                textTransform:"uppercase", letterSpacing:".5px", marginBottom:3 }}>{label}</div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:800 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ position:"relative", marginBottom:18 }}>
        <Search size={14} style={{ position:"absolute", left:13, top:"50%",
          transform:"translateY(-50%)", color:"var(--sub)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une entreprise, IFU, RCCM ou secteur..."
          style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
            borderRadius:9, padding:"10px 12px 10px 38px", color:"var(--text)",
            fontSize:13, outline:"none", boxSizing:"border-box" }} />
      </div>

      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", paddingTop:60 }}>
          <div style={{ width:24, height:24, border:"3px solid var(--gold)",
            borderTopColor:"transparent", borderRadius:"50%",
            animation:"spin .8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : tenants.length === 0 ? (
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
          padding:"48px 24px", textAlign:"center", color:"var(--sub)", fontSize:14 }}>
          <Check size={32} style={{ color:"var(--green)", marginBottom:12 }} />
          <div>Aucun dossier en attente de validation KYB</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
          padding:"42px 24px", textAlign:"center", color:"var(--sub)", fontSize:14 }}>
          Aucun dossier ne correspond à votre recherche
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {filtered.map(t => {
            return (
              <div key={t.id} style={{ background:"var(--card)",
                border:"1px solid var(--border)",
                borderRadius:8, padding:24, transition:"border-color .3s" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:18 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:17, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}
                    onClick={() => router.push(`/admin/kyb/${t.id}`)}>
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
                    <button type="button" onClick={() => router.push(`/admin/kyb/${t.id}`)}
                      style={{ background:"var(--gold)", border:"none",
                        color:"#fff", padding:"9px 16px", borderRadius:9,
                        fontWeight:700, fontSize:13, cursor:"pointer", display:"flex",
                        alignItems:"center", gap:6 }}>
                      <ExternalLink size={14} /> Ouvrir le dossier
                    </button>
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
                      fontSize:12, padding:"4px 12px", borderRadius:8,
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
