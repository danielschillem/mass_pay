"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { Beneficiary, Wallet, BatchType } from "@/lib/types";
import { OpBadge } from "@/components/ui/StatCard";
import { fcfa, calcCommission, calcProvision } from "@/lib/types";

export default function NewBatchPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<BatchType>("salaire");
  const [benefs, setBenefs] = useState<Beneficiary[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.tenant.beneficiaries(1, 100), api.tenant.wallet()])
      .then(([b, w]) => {
        const list = b.data;
        setBenefs(list);
        setWallet(w);
        const sel = new Set(list.map(x => x.id));
        setSelected(sel);
        const amt: Record<string, number> = {};
        list.forEach(x => { amt[x.id] = x.default_amount || 0; });
        setAmounts(amt);
      });
  }, []);

  const selBenefs = benefs.filter(b => selected.has(b.id));
  const masse     = selBenefs.reduce((a, b) => a + (amounts[b.id] ?? 0), 0);
  const commission = calcCommission(masse);
  const provision  = calcProvision(masse);
  const sufficient = wallet ? provision <= wallet.available_balance : false;

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const execute = async () => {
    setLoading(true);
    setError("");
    try {
      const items = selBenefs.map(b => ({
        beneficiary_id: b.id,
        full_name: b.full_name,
        phone_number: b.phone_number,
        amount: amounts[b.id] ?? 0,
      }));
      const batch = await api.tenant.createBatch({ label: name, type, items });
      await api.tenant.validateBatch(batch.id);
      await api.tenant.executeBatch(batch.id);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:"80px 20px", textAlign:"center" }}>
        <div style={{ width:76, height:76, background:"rgba(13,201,138,.13)",
          borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:22, border:"2px solid rgba(13,201,138,.3)" }}>
          <CheckCircle2 size={38} color="#0DC98A" />
        </div>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:"0 0 8px",
          fontFamily:"'Sora',sans-serif" }}>Batch en cours d&apos;exécution</h2>
        <p style={{ color:"#98A5C4", fontSize:14, maxWidth:420, lineHeight:1.6, margin:"0 0 24px" }}>
          {selBenefs.length} virements initiés · Masse {fcfa(masse)} ·
          Les bénéficiaires recevront un SMS de confirmation.
        </p>
        <div style={{ display:"flex", gap:12 }}>
          <button onClick={() => router.push("/dashboard/batches")}
            style={{ background:"#E4A730", color:"#000", border:"none", padding:"10px 22px",
              borderRadius:10, fontWeight:700, cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
            Voir l&apos;historique
          </button>
          <button onClick={() => { setDone(false); setStep(1); setName(""); }}
            style={{ background:"#172035", border:"1px solid #1C2840", color:"#E4EAF8",
              padding:"10px 22px", borderRadius:10, fontWeight:600, cursor:"pointer" }}>
            Nouveau batch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:0,
          fontFamily:"'Sora',sans-serif" }}>Nouveau batch</h1>
        <p style={{ color:"#5A6888", fontSize:13, margin:"4px 0 0" }}>Virement en masse · Mobile Money</p>
      </div>

      {/* Stepper */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:32 }}>
        {[{n:1,l:"Informations"},{n:2,l:"Bénéficiaires"},{n:3,l:"Validation"}].map((s, i) => (
          <div key={s.n} style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:"50%",
                background: step > s.n ? "#0DC98A" : step===s.n ? "#E4A730" : "#172035",
                border:`2px solid ${step > s.n ? "#0DC98A" : step===s.n ? "#E4A730" : "#1C2840"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:800, fontSize:13, color: step >= s.n ? "#000" : "#5A6888",
                transition:"all .3s" }}>
                {step > s.n ? <Check size={14} color="#000" /> : s.n}
              </div>
              <span style={{ color: step===s.n ? "#E4EAF8" : "#5A6888",
                fontWeight: step===s.n ? 600 : 400, fontSize:13 }}>{s.l}</span>
            </div>
            {i<2 && <div style={{ width:56, height:1.5, margin:"0 14px", transition:"all .3s",
              background: step > s.n ? "#0DC98A" : "#1C2840" }} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step===1 && (
        <div style={{ maxWidth:500 }}>
          <div style={{ marginBottom:20 }}>
            <label style={{ color:"#98A5C4", fontSize:11, fontWeight:700,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:8 }}>
              Libellé du batch
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex : Salaires Juin 2025"
              style={{ width:"100%", background:"#172035", border:"1px solid #1C2840",
                borderRadius:10, padding:"12px 16px", color:"#E4EAF8", fontSize:14,
                outline:"none", boxSizing:"border-box" as const }} />
          </div>
          <div style={{ marginBottom:28 }}>
            <label style={{ color:"#98A5C4", fontSize:11, fontWeight:700,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:8 }}>
              Type de virement
            </label>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
              {(["salaire","prime","commission","autre"] as BatchType[]).map(v => (
                <button key={v} onClick={() => setType(v)} style={{
                  background: type===v ? "rgba(228,167,48,.13)" : "#172035",
                  border:`1px solid ${type===v ? "#E4A730" : "#1C2840"}`,
                  borderRadius:10, padding:"9px 18px",
                  color: type===v ? "#E4A730" : "#98A5C4",
                  fontWeight: type===v ? 700 : 400, fontSize:13, cursor:"pointer",
                  textTransform:"capitalize" as const }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => name && setStep(2)} disabled={!name}
            style={{ background: name ? "#E4A730" : "#172035",
              color: name ? "#000" : "#5A6888", border:"none",
              padding:"12px 28px", borderRadius:10, fontWeight:700, fontSize:14,
              cursor: name ? "pointer" : "not-allowed", fontFamily:"'Sora',sans-serif" }}>
            Continuer →
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step===2 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <span style={{ color:"#98A5C4", fontSize:13 }}>
              <b style={{ color:"#E4EAF8" }}>{selected.size}</b> bénéficiaire(s) sélectionné(s)
            </span>
            <button style={{ background:"#172035", border:"1px solid #1C2840",
              color:"#98A5C4", padding:"7px 14px", borderRadius:8, fontSize:12,
              cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
              <Upload size={12} /> Importer CSV
            </button>
          </div>
          <div style={{ background:"#111827", border:"1px solid #1C2840",
            borderRadius:14, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1C2840", background:"#0C1020" }}>
                  <th style={{ padding:"10px 16px", width:40 }}></th>
                  {["Nom","Téléphone","Opérateur","Montant (FCFA)"].map(h => (
                    <th key={h} style={{ padding:"10px 16px", textAlign:"left",
                      color:"#5A6888", fontSize:10, fontWeight:700,
                      textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {benefs.map((b, i) => {
                  const on = selected.has(b.id);
                  return (
                    <tr key={b.id} style={{ borderBottom: i<benefs.length-1 ? "1px solid rgba(28,40,64,.5)" : "none",
                      opacity: on ? 1 : 0.45 }}>
                      <td style={{ padding:"11px 16px" }}>
                        <div onClick={() => toggle(b.id)} style={{ width:18, height:18,
                          borderRadius:5, border:`2px solid ${on ? "#E4A730" : "#1C2840"}`,
                          background: on ? "#E4A730" : "transparent",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer" }}>
                          {on && <Check size={11} color="#000" />}
                        </div>
                      </td>
                      <td style={{ padding:"11px 16px", fontWeight:600, fontSize:13 }}>{b.full_name}</td>
                      <td style={{ padding:"11px 16px", color:"#98A5C4", fontSize:12 }}>{b.phone_number}</td>
                      <td style={{ padding:"11px 16px" }}><OpBadge op={b.operator} /></td>
                      <td style={{ padding:"11px 16px" }}>
                        <input type="number" value={amounts[b.id] ?? 0}
                          onChange={e => setAmounts({...amounts, [b.id]: parseInt(e.target.value)||0})}
                          style={{ background:"#172035", border:"1px solid #1C2840", borderRadius:7,
                            padding:"5px 10px", color:"#E4EAF8", fontSize:13, width:110,
                            outline:"none", textAlign:"right" as const }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setStep(1)} style={{ background:"#172035",
              border:"1px solid #1C2840", color:"#98A5C4", padding:"11px 20px",
              borderRadius:10, fontWeight:600, cursor:"pointer", fontSize:13 }}>← Retour</button>
            <button onClick={() => setStep(3)} style={{ background:"#E4A730", color:"#000",
              border:"none", padding:"11px 24px", borderRadius:10, fontWeight:700,
              cursor:"pointer", fontSize:13, fontFamily:"'Sora',sans-serif" }}>
              Voir le récapitulatif →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Recap */}
      {step===3 && (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" as const }}>
          <div style={{ flex:2, minWidth:280 }}>
            <div style={{ background:"#111827", border:"1px solid #1C2840",
              borderRadius:14, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid #1C2840",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>
                  {selBenefs.length} bénéficiaires · {name}
                </span>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #1C2840" }}>
                    {["Bénéficiaire","Réseau","Montant net"].map(h => (
                      <th key={h} style={{ padding:"9px 18px", textAlign:"left",
                        color:"#5A6888", fontSize:10, fontWeight:700,
                        textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selBenefs.map((b, i) => (
                    <tr key={b.id} style={{ borderBottom: i<selBenefs.length-1 ? "1px solid rgba(28,40,64,.5)" : "none" }}>
                      <td style={{ padding:"11px 18px" }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{b.full_name}</div>
                        <div style={{ color:"#5A6888", fontSize:11 }}>{b.phone_number}</div>
                      </td>
                      <td style={{ padding:"11px 18px" }}><OpBadge op={b.operator} /></td>
                      <td style={{ padding:"11px 18px", color:"#E4EAF8", fontWeight:700,
                        fontSize:13, textAlign:"right" as const }}>
                        {(amounts[b.id]??0).toLocaleString("fr-FR")} F
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ flex:1, minWidth:250 }}>
            <div style={{ background:"#111827", border:"1px solid #1C2840", borderRadius:14, padding:22 }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:20,
                fontFamily:"'Sora',sans-serif" }}>Récapitulatif financier</div>

              {[
                ["Masse totale à verser", fcfa(masse), "#E4EAF8"],
                ["Commission plateforme (1.5%)", fcfa(commission), "#E4A730"],
              ].map(([l,v,c]) => (
                <div key={l as string} style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:12 }}>
                  <span style={{ color:"#5A6888", fontSize:12 }}>{l}</span>
                  <span style={{ color:c as string, fontWeight:700, fontSize:13 }}>{v}</span>
                </div>
              ))}

              <div style={{ height:1, background:"#1C2840", margin:"16px 0" }} />

              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:18 }}>
                <span style={{ color:"#E4EAF8", fontSize:14, fontWeight:700 }}>Provision requise</span>
                <span style={{ color:"#E4EAF8", fontSize:18, fontWeight:800,
                  fontFamily:"'Sora',sans-serif" }}>{fcfa(provision)}</span>
              </div>

              <div style={{ background: sufficient ? "rgba(13,201,138,.13)" : "rgba(240,82,82,.13)",
                border:`1px solid ${sufficient ? "rgba(13,201,138,.25)" : "rgba(240,82,82,.25)"}`,
                borderRadius:10, padding:"13px 16px", marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ color:"#5A6888", fontSize:12 }}>Wallet disponible</span>
                  <span style={{ color: sufficient ? "#0DC98A" : "#F05252", fontWeight:700, fontSize:13 }}>
                    {wallet ? fcfa(wallet.available_balance) : "—"}
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8 }}>
                  {sufficient
                    ? <><CheckCircle2 size={13} color="#0DC98A" /><span style={{ color:"#0DC98A", fontSize:12, fontWeight:700 }}>Solde suffisant</span></>
                    : <><AlertTriangle size={13} color="#F05252" /><span style={{ color:"#F05252", fontSize:12, fontWeight:700 }}>Solde insuffisant — rechargez</span></>}
                </div>
              </div>

              {error && (
                <div style={{ background:"rgba(240,82,82,.13)", borderRadius:9, padding:"10px 14px",
                  color:"#F05252", fontSize:13, marginBottom:14 }}>{error}</div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={execute} disabled={!sufficient || loading}
                  style={{ background: sufficient && !loading ? "#0DC98A" : "#172035",
                    color: sufficient && !loading ? "#000" : "#5A6888",
                    border:"none", padding:"13px", borderRadius:10, fontWeight:800,
                    fontSize:14, cursor: sufficient && !loading ? "pointer" : "not-allowed",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    gap:8, fontFamily:"'Sora',sans-serif", transition:"all .2s" }}>
                  <Send size={16} />
                  {loading ? "Exécution…" : "Exécuter le virement"}
                </button>
                <button onClick={() => setStep(2)} style={{ background:"transparent",
                  border:"1px solid #1C2840", color:"#98A5C4", padding:"10px",
                  borderRadius:10, fontWeight:600, fontSize:13, cursor:"pointer" }}>
                  ← Modifier les bénéficiaires
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
