"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload, Send, CheckCircle2, AlertTriangle, X, Trash2, Download, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Beneficiary, Wallet, BatchType, CreateBatchItemInput } from "@/lib/types";
import { OpBadge } from "@/components/ui/StatCard";
import { fcfa, calcCommission, calcProvision } from "@/lib/types";

// ── Helpers CSV batch ─────────────────────────────────────────────
// Format attendu : full_name ; phone_number ; amount
// Le séparateur peut être ";" ou ","

function parseBatchCSV(text: string): CreateBatchItemInput[] {
  const sep   = text.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  const start = /^\d/.test(lines[0]?.split(sep)[1] ?? "") ? 0 : 1; // skip header
  return lines.slice(start).map(line => {
    const [full_name = "", phone_number = "", amount = "0"] = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    return { full_name, phone_number, amount: parseInt(amount, 10) || 0 };
  }).filter(r => r.full_name && r.phone_number);
}

export default function NewBatchPage() {
  const router    = useRouter();
  const csvRef    = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<BatchType>("salaire");
  const [benefs, setBenefs] = useState<Beneficiary[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [extras, setExtras]   = useState<CreateBatchItemInput[]>([]);   // items CSV ad-hoc
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const items = parseBatchCSV((e.target?.result as string) ?? "");
      if (items.length === 0) return;
      setExtras(prev => [...prev, ...items]);
    };
    reader.readAsText(file, "utf-8");
  };

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

  const selBenefs  = benefs.filter(b => selected.has(b.id));
  const massebenef = selBenefs.reduce((a, b) => a + (amounts[b.id] ?? 0), 0);
  const masseExtra = extras.reduce((a, x) => a + x.amount, 0);
  const masse      = massebenef + masseExtra;
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
      const benefItems = selBenefs.map(b => ({
        beneficiary_id: b.id,
        full_name: b.full_name,
        phone_number: b.phone_number,
        amount: amounts[b.id] ?? 0,
      }));
      const items = [...benefItems, ...extras];
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
        <div style={{ width:76, height:76, background:"var(--green-sub)",
          borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:22, border:"2px solid rgba(13,201,138,.3)" }}>
          <CheckCircle2 size={38} color="var(--green)" />
        </div>
        <h2 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:"0 0 8px",
          fontFamily:"'Sora',sans-serif" }}>Batch en cours d&apos;exécution</h2>
        <p style={{ color:"var(--mid)", fontSize:14, maxWidth:420, lineHeight:1.6, margin:"0 0 24px" }}>
          {selBenefs.length + extras.length} virements initiés · Masse {fcfa(masse)} ·
          Les bénéficiaires recevront un SMS de confirmation.
        </p>
        <div style={{ display:"flex", gap:12 }}>
          <button onClick={() => router.push("/dashboard/batches")}
            style={{ background:"var(--gold)", color:"#fff", border:"none", padding:"10px 22px",
              borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
            Voir l&apos;historique
          </button>
          <button onClick={() => { setDone(false); setStep(1); setName(""); }}
            style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--text)",
              padding:"10px 22px", borderRadius:8, fontWeight:600, cursor:"pointer" }}>
            Nouveau batch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
          fontFamily:"'Sora',sans-serif" }}>Nouveau batch</h1>
        <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>Virement en masse · Mobile Money</p>
      </div>

      {/* Stepper */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:32 }}>
        {[{n:1,l:"Informations"},{n:2,l:"Bénéficiaires"},{n:3,l:"Validation"}].map((s, i) => (
          <div key={s.n} style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:"50%",
                background: step > s.n ? "var(--green)" : step===s.n ? "var(--gold)" : "var(--elevated)",
                border:`2px solid ${step > s.n ? "var(--green)" : step===s.n ? "var(--gold)" : "var(--border)"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:800, fontSize:13, color: step >= s.n ? "#fff" : "var(--sub)",
                transition:"all .3s" }}>
                {step > s.n ? <Check size={14} color="#fff" /> : s.n}
              </div>
              <span style={{ color: step===s.n ? "var(--text)" : "var(--sub)",
                fontWeight: step===s.n ? 600 : 400, fontSize:13 }}>{s.l}</span>
            </div>
            {i<2 && <div style={{ width:56, height:1.5, margin:"0 14px", transition:"all .3s",
              background: step > s.n ? "var(--green)" : "var(--border)" }} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step===1 && (
        <div style={{ maxWidth:500 }}>
          <div style={{ marginBottom:20 }}>
            <label style={{ color:"var(--mid)", fontSize:11, fontWeight:700,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:8 }}>
              Libellé du batch
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex : Salaires Juin 2025"
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"12px 16px", color:"var(--text)", fontSize:14,
                outline:"none", boxSizing:"border-box" as const }} />
          </div>
          <div style={{ marginBottom:28 }}>
            <label style={{ color:"var(--mid)", fontSize:11, fontWeight:700,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:8 }}>
              Type de virement
            </label>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
              {(["salaire","prime","commission","autre"] as BatchType[]).map(v => (
                <button key={v} onClick={() => setType(v)} style={{
                  background: type===v ? "var(--gold-sub)" : "var(--elevated)",
                  border:`1px solid ${type===v ? "var(--gold)" : "var(--border)"}`,
                  borderRadius:8, padding:"9px 18px",
                  color: type===v ? "var(--gold)" : "var(--mid)",
                  fontWeight: type===v ? 700 : 400, fontSize:13, cursor:"pointer",
                  textTransform:"capitalize" as const }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => name && setStep(2)} disabled={!name}
            style={{ background: name ? "var(--gold)" : "var(--elevated)",
              color: name ? "#fff" : "var(--sub)", border:"none",
              padding:"12px 28px", borderRadius:8, fontWeight:700, fontSize:14,
              cursor: name ? "pointer" : "not-allowed", fontFamily:"'Sora',sans-serif" }}>
            Continuer →
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step===2 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ color:"var(--mid)", fontSize:13 }}>
                <b style={{ color:"var(--text)" }}>{selected.size}</b> bénéficiaire(s) sélectionné(s)
              </span>
              <span style={{ color:"var(--sub)", fontSize:11 }}>
                · {selBenefs.reduce((a, b) => a + (amounts[b.id] ?? 0), 0).toLocaleString("fr-FR")} F
              </span>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button type="button" onClick={() => {
                if (selected.size === benefs.length) setSelected(new Set());
                else setSelected(new Set(benefs.map(b => b.id)));
              }}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"7px 12px", borderRadius:8, fontSize:11,
                  cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                <ChevronDown size={11} /> {selected.size === benefs.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <button type="button" onClick={() => {
                const csv = "full_name;phone_number;amount\nOUEDRAOGO Adama;70123456;50000";
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href     = url;
                a.download = "batch_template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"7px 12px", borderRadius:8, fontSize:11,
                  cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                <Download size={11} /> Modèle
              </button>
              <button type="button" onClick={() => csvRef.current?.click()}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"7px 12px", borderRadius:8, fontSize:11,
                  cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                <Upload size={11} /> CSV
              </button>
              <input ref={csvRef} type="file" accept=".csv,.txt" aria-label="Importer un fichier CSV de bénéficiaires" style={{ display:"none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleCsvUpload(f); e.target.value = ""; } }} />
            </div>
          </div>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:8, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                  <th style={{ padding:"10px 16px", width:40 }}></th>
                  {["Nom","Téléphone","Opérateur","Montant (FCFA)"].map(h => (
                    <th key={h} style={{ padding:"10px 16px", textAlign:"left",
                      color:"var(--sub)", fontSize:10, fontWeight:700,
                      textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {benefs.map((b, i) => {
                  const on = selected.has(b.id);
                  return (
                    <tr key={b.id} style={{ borderBottom: i<benefs.length-1 ? "1px solid var(--border-soft)" : "none",
                      opacity: on ? 1 : 0.45 }}>
                      <td style={{ padding:"11px 16px" }}>
                        <div onClick={() => toggle(b.id)} style={{ width:18, height:18,
                          borderRadius:5, border:`2px solid ${on ? "var(--gold)" : "var(--border)"}`,
                          background: on ? "var(--gold)" : "transparent",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer" }}>
                          {on && <Check size={11} color="#fff" />}
                        </div>
                      </td>
                      <td style={{ padding:"11px 16px", fontWeight:600, fontSize:13 }}>{b.full_name}</td>
                      <td style={{ padding:"11px 16px", color:"var(--mid)", fontSize:12 }}>{b.phone_number}</td>
                      <td style={{ padding:"11px 16px" }}><OpBadge op={b.operator} /></td>
                      <td style={{ padding:"11px 16px" }}>
                        <input type="number" value={amounts[b.id] ?? 0}
                          onChange={e => setAmounts({...amounts, [b.id]: parseInt(e.target.value)||0})}
                          style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:7,
                            padding:"5px 10px", color:"var(--text)", fontSize:13, width:110,
                            outline:"none", textAlign:"right" as const }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Extras CSV */}
          {extras.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"var(--gold)" }}>
                  Lignes CSV importées ({extras.length})
                </span>
                <button type="button" onClick={() => setExtras([])}
                  style={{ background:"rgba(240,82,82,.1)", border:"1px solid var(--red-border)",
                    borderRadius:7, padding:"4px 10px", color:"var(--red)", fontSize:11,
                    fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                  <Trash2 size={11} /> Vider
                </button>
              </div>
              <div style={{ background:"var(--card)", border:"1px solid var(--gold-sub-strong)",
                borderRadius:8, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"var(--surf)", borderBottom:"1px solid var(--border)" }}>
                      {["Nom","Téléphone","Montant (FCFA)",""].map(h => (
                        <th key={h} style={{ padding:"8px 14px", textAlign:"left",
                          color:"var(--sub)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".4px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extras.map((ex, i) => (
                      <tr key={i} style={{ borderBottom: i < extras.length-1 ? "1px solid rgba(28,40,64,.4)" : "none" }}>
                        <td style={{ padding:"9px 14px", fontWeight:600, fontSize:12 }}>{ex.full_name}</td>
                        <td style={{ padding:"9px 14px", color:"var(--mid)", fontSize:12, fontFamily:"monospace" }}>{ex.phone_number}</td>
                        <td style={{ padding:"9px 14px" }}>
                          <input type="number" value={ex.amount}
                            aria-label={`Montant pour ${ex.full_name}`}
                            onChange={e => setExtras(prev => prev.map((x, j) => j === i ? { ...x, amount: parseInt(e.target.value)||0 } : x))}
                            style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:7,
                              padding:"4px 8px", color:"var(--text)", fontSize:12, width:100,
                              outline:"none", textAlign:"right" as const }} />
                        </td>
                        <td style={{ padding:"9px 14px" }}>
                          <button type="button" onClick={() => setExtras(prev => prev.filter((_, j) => j !== i))}
                            aria-label={`Supprimer ${ex.full_name}`}
                            style={{ background:"none", border:"none", color:"var(--sub)",
                              cursor:"pointer", padding:"2px 4px" }}>
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setStep(1)} style={{ background:"var(--elevated)",
              border:"1px solid var(--border)", color:"var(--mid)", padding:"11px 20px",
              borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 }}>← Retour</button>
            <button onClick={() => setStep(3)} style={{ background:"var(--gold)", color:"#fff",
              border:"none", padding:"11px 24px", borderRadius:8, fontWeight:700,
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
            <div style={{ background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>
                  {selBenefs.length + extras.length} bénéficiaires · {name}
                </span>
                {extras.length > 0 && (
                  <span style={{ fontSize:11, color:"var(--gold)", fontWeight:600 }}>
                    dont {extras.length} via CSV
                  </span>
                )}
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Bénéficiaire","Réseau","Montant net"].map(h => (
                      <th key={h} style={{ padding:"9px 18px", textAlign:"left",
                        color:"var(--sub)", fontSize:10, fontWeight:700,
                        textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selBenefs.map((b, i) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td style={{ padding:"11px 18px" }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{b.full_name}</div>
                        <div style={{ color:"var(--sub)", fontSize:11 }}>{b.phone_number}</div>
                      </td>
                      <td style={{ padding:"11px 18px" }}><OpBadge op={b.operator} /></td>
                      <td style={{ padding:"11px 18px", color:"var(--text)", fontWeight:700,
                        fontSize:13, textAlign:"right" as const }}>
                        {(amounts[b.id]??0).toLocaleString("fr-FR")} F
                      </td>
                    </tr>
                  ))}
                  {extras.map((ex, i) => (
                    <tr key={`extra-${i}`} style={{ borderBottom: i < extras.length-1 ? "1px solid var(--border-soft)" : "none",
                      background:"rgba(228,167,48,.04)" }}>
                      <td style={{ padding:"11px 18px" }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{ex.full_name}</div>
                        <div style={{ color:"var(--sub)", fontSize:11 }}>{ex.phone_number}
                          <span style={{ marginLeft:6, color:"var(--gold)", fontSize:10, fontWeight:700 }}>CSV</span>
                        </div>
                      </td>
                      <td style={{ padding:"11px 18px", color:"var(--sub)", fontSize:12 }}>—</td>
                      <td style={{ padding:"11px 18px", color:"var(--text)", fontWeight:700,
                        fontSize:13, textAlign:"right" as const }}>
                        {ex.amount.toLocaleString("fr-FR")} F
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ flex:1, minWidth:250 }}>
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:22 }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:20,
                fontFamily:"'Sora',sans-serif" }}>Récapitulatif financier</div>

              {[
                ["Masse totale à verser", fcfa(masse), "var(--text)"],
                ["Commission plateforme (1.5%)", fcfa(commission), "var(--gold)"],
              ].map(([l,v,c]) => (
                <div key={l as string} style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:12 }}>
                  <span style={{ color:"var(--sub)", fontSize:12 }}>{l}</span>
                  <span style={{ color:c as string, fontWeight:700, fontSize:13 }}>{v}</span>
                </div>
              ))}

              <div style={{ height:1, background:"var(--border)", margin:"16px 0" }} />

              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:18 }}>
                <span style={{ color:"var(--text)", fontSize:14, fontWeight:700 }}>Provision requise</span>
                <span style={{ color:"var(--text)", fontSize:18, fontWeight:800,
                  fontFamily:"'Sora',sans-serif" }}>{fcfa(provision)}</span>
              </div>

              <div style={{ background: sufficient ? "var(--green-sub)" : "var(--red-sub)",
                border:`1px solid ${sufficient ? "rgba(13,201,138,.25)" : "var(--red-border)"}`,
                borderRadius:8, padding:"13px 16px", marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ color:"var(--sub)", fontSize:12 }}>Wallet disponible</span>
                  <span style={{ color: sufficient ? "var(--green)" : "var(--red)", fontWeight:700, fontSize:13 }}>
                    {wallet ? fcfa(wallet.available_balance) : "—"}
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8 }}>
                  {sufficient
                    ? <><CheckCircle2 size={13} color="var(--green)" /><span style={{ color:"var(--green)", fontSize:12, fontWeight:700 }}>Solde suffisant</span></>
                    : <><AlertTriangle size={13} color="var(--red)" /><span style={{ color:"var(--red)", fontSize:12, fontWeight:700 }}>Solde insuffisant, rechargez</span></>}
                </div>
              </div>

              {error && (
                <div style={{ background:"var(--red-sub)", borderRadius:9, padding:"10px 14px",
                  color:"var(--red)", fontSize:13, marginBottom:14 }}>{error}</div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={execute} disabled={!sufficient || loading}
                  style={{ background: sufficient && !loading ? "var(--green)" : "var(--elevated)",
                    color: sufficient && !loading ? "#fff" : "var(--sub)",
                    border:"none", padding:"13px", borderRadius:8, fontWeight:800,
                    fontSize:14, cursor: sufficient && !loading ? "pointer" : "not-allowed",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    gap:8, fontFamily:"'Sora',sans-serif", transition:"all .2s" }}>
                  <Send size={16} />
                  {loading ? "Exécution…" : "Exécuter le virement"}
                </button>
                <button onClick={() => setStep(2)} style={{ background:"transparent",
                  border:"1px solid var(--border)", color:"var(--mid)", padding:"10px",
                  borderRadius:8, fontWeight:600, fontSize:13, cursor:"pointer" }}>
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
