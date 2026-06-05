"use client";
import { useState } from "react";
import { CheckCircle2, Check, X } from "lucide-react";
import { api } from "@/lib/api";

// Mock KYB queue — en prod, endpoint GET /admin/tenants?status=kyb_pending
const KYB_MOCK = [
  { id:"t4", nom:"BRAKINA SA",  date:"01/06/2025", responsable:"Marc ILBOUDO",  email:"m.ilboudo@brakina.bf",  docs:["RCCM","IFU","Pièce identité","Formulaire KYB"], manquant:[] },
  { id:"t5", nom:"FASOPLAST",   date:"02/06/2025", responsable:"Sophie TRAORE", email:"s.traore@fasoplast.bf", docs:["RCCM","IFU"], manquant:["Pièce identité dirigeant","Formulaire KYB signé"] },
];

export default function KYBPage() {
  const [activated, setActivated] = useState<Set<string>>(new Set());

  const activate = async (id: string) => {
    try {
      await api.admin.activate(id);
      setActivated(s => new Set([...s, id]));
    } catch {
      // En démo, activer directement
      setActivated(s => new Set([...s, id]));
    }
  };

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#E4EAF8", margin:0,
          fontFamily:"'Sora',sans-serif" }}>KYB · Onboarding</h1>
        <p style={{ color:"#5A6888", fontSize:13, margin:"4px 0 0" }}>
          Validation des dossiers entreprises
        </p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {KYB_MOCK.map(k => {
          const done     = activated.has(k.id);
          const complete = k.manquant.length === 0;
          return (
            <div key={k.id} style={{ background:"#111827",
              border:`1px solid ${done ? "rgba(13,201,138,.4)" : "#1C2840"}`,
              borderRadius:14, padding:24, transition:"border-color .3s" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:18 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:17, fontFamily:"'Sora',sans-serif" }}>
                    {k.nom}
                  </div>
                  <div style={{ color:"#5A6888", fontSize:12, marginTop:5,
                    display:"flex", gap:16, flexWrap:"wrap" as const }}>
                    <span>{k.responsable}</span>
                    <span>{k.email}</span>
                    <span>Soumis le {k.date}</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {!done && complete && (
                    <button onClick={() => activate(k.id)}
                      style={{ background:"#0DC98A", color:"#000", border:"none",
                        padding:"9px 18px", borderRadius:9, fontWeight:700,
                        fontSize:13, cursor:"pointer", display:"flex",
                        alignItems:"center", gap:7 }}>
                      <CheckCircle2 size={15} /> Valider et activer
                    </button>
                  )}
                  {!done && !complete && (
                    <button style={{ background:"rgba(240,82,82,.13)", color:"#F05252",
                      border:"1px solid rgba(240,82,82,.3)", padding:"9px 18px",
                      borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer" }}>
                      Demander compléments
                    </button>
                  )}
                  {done && (
                    <div style={{ background:"rgba(13,201,138,.13)", color:"#0DC98A",
                      padding:"9px 18px", borderRadius:9, fontWeight:700, fontSize:13,
                      display:"flex", alignItems:"center", gap:7 }}>
                      <Check size={14} /> Tenant activé
                    </div>
                  )}
                </div>
              </div>

              <div style={{ fontSize:11, color:"#5A6888", fontWeight:700,
                textTransform:"uppercase", letterSpacing:".4px", marginBottom:10 }}>
                Documents
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                {k.docs.map(d => (
                  <span key={d} style={{ background:"rgba(13,201,138,.13)", color:"#0DC98A",
                    fontSize:12, padding:"4px 12px", borderRadius:20,
                    display:"flex", alignItems:"center", gap:5, fontWeight:600 }}>
                    <Check size={11} /> {d}
                  </span>
                ))}
                {k.manquant.map(d => (
                  <span key={d} style={{ background:"rgba(240,82,82,.13)", color:"#F05252",
                    fontSize:12, padding:"4px 12px", borderRadius:20,
                    display:"flex", alignItems:"center", gap:5, fontWeight:600 }}>
                    <X size={11} /> {d} — manquant
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
