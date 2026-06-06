"use client";
import { useEffect, useRef, useState } from "react";
import { Search, Plus, Upload, Trash2, X, Pencil, CheckCircle, AlertCircle, Download, Filter } from "lucide-react";
import { api } from "@/lib/api";
import type { Beneficiary } from "@/lib/types";
import { OpBadge } from "@/components/ui/StatCard";

// ── Helpers ────────────────────────────────────────────────────────

function downloadCSVTemplate() {
  const csv = "full_name;phone_number;group_name;default_amount;external_ref\nOUEDRAOGO Adama;70123456;Direction;50000;EMP-001\nTRAORE Fatima;76123456;Marketing;35000;EMP-002";
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "mynapay_beneficiaires_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function validateCSVRow(row: string[], lineNum: number): string | null {
  const [full_name = "", phone_number = "", group_name = "", default_amount = "", external_ref = ""] = row;
  if (!full_name.trim()) return "Nom complet requis";
  if (!phone_number.trim()) return "Numéro de téléphone requis";
  if (!/^\d{6,15}$/.test(phone_number.replace(/\s/g, ""))) return "Numéro invalide";
  if (default_amount && (!/^\d+$/.test(default_amount) || parseInt(default_amount) <= 0)) return "Montant invalide";
  return null;
}

// ── Import CSV ─────────────────────────────────────────────────────
// Format attendu (séparateur ; ou ,) :
//   full_name ; phone_number ; group_name ; default_amount ; external_ref
// La première ligne (header) est ignorée automatiquement.

type ImportResult = { ok: number; errors: { line: number; reason: string }[] };

function CsvImportModal({ onClose, onDone }: {
  onClose: () => void;
  onDone: (created: Beneficiary[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]       = useState<string[][]>([]);
  const [rowErrors, setRowErrors] = useState<(string | null)[]>([]);
  const [state, setState]     = useState<"idle" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult]   = useState<ImportResult | null>(null);
  const [created, setCreated] = useState<Beneficiary[]>([]);

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) ?? "";
      const sep  = text.includes(";") ? ";" : ",";
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
      // skip header if first cell looks like text (not a phone number)
      const start = /^\d/.test(lines[0]?.split(sep)[1] ?? "") ? 0 : 1;
      const parsed = lines.slice(start).map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "")));
      setRows(parsed);
      setRowErrors(parsed.map((r, i) => validateCSVRow(r, i + 2)));
      setState("preview");
    };
    reader.readAsText(file, "utf-8");
  };

  const startImport = async () => {
    setState("importing");
    const ok: Beneficiary[] = [];
    const errors: ImportResult["errors"] = [];
    const validRows = rows.filter((_, i) => !rowErrors[i]);
    for (let i = 0; i < validRows.length; i++) {
      const [full_name = "", phone_number = "", group_name = "", default_amount = "", external_ref = ""] = validRows[i];
      try {
        const b = await api.tenant.createBeneficiary({
          full_name, phone_number,
          group_name: group_name || undefined,
          default_amount: default_amount ? parseInt(default_amount, 10) : 0,
          external_ref: external_ref || undefined,
        });
        ok.push(b);
      } catch (e: unknown) {
        errors.push({ line: i + 2, reason: (e as Error).message });
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }
    // Add pre-validation errors
    rowErrors.forEach((err, i) => {
      if (err) errors.push({ line: i + 2, reason: err });
    });
    setCreated(ok);
    setResult({ ok: ok.length, errors });
    setState("done");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget && state !== "importing") onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
        padding:28, width:520, maxHeight:"80vh", overflowY:"auto" }}>

        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Importer des bénéficiaires (CSV)
          </h2>
          {state !== "importing" && (
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
              <X size={18} />
            </button>
          )}
        </div>

        {state === "idle" && (
          <div>
            <div style={{ background:"var(--surf)", border:"2px dashed var(--border)", borderRadius:8,
              padding:"32px 20px", textAlign:"center", marginBottom:18 }}>
              <Upload size={28} color="var(--sub)" style={{ marginBottom:10 }} />
              <div style={{ color:"var(--mid)", fontSize:13, marginBottom:14 }}>
                Glissez un fichier CSV ou cliquez pour sélectionner
              </div>
              <div style={{ color:"var(--sub)", fontSize:11, marginBottom:18, lineHeight:1.6 }}>
                Format : <code style={{ color:"var(--gold)" }}>full_name ; phone_number ; group_name ; default_amount ; external_ref</code>
                <br />Séparateur <code style={{ color:"var(--gold)" }}>;</code> ou <code style={{ color:"var(--gold)" }}>,</code>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ background:"var(--gold)", color:"#fff", border:"none", padding:"9px 20px",
                  borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                  fontFamily:"'Sora',sans-serif" }}>
                Choisir un fichier
              </button>
              <div style={{ marginTop:14 }}>
                <button type="button" onClick={downloadCSVTemplate}
                  style={{ background:"transparent", border:"1px solid var(--border)",
                    color:"var(--mid)", padding:"7px 14px", borderRadius:8, fontSize:12,
                    cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
                  <Download size={12} /> Télécharger le modèle CSV
                </button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
          </div>
        )}

        {state === "preview" && (
          <div>
            <div style={{ color:"var(--mid)", fontSize:13, marginBottom:14 }}>
              <b style={{ color:"var(--text)" }}>{rows.length}</b> lignes détectées ·
              <span style={{ color: rowErrors.some(e => e) ? "var(--red)" : "var(--green)", marginLeft:4 }}>
                {rowErrors.filter(e => e).length} erreurs de validation
              </span>
            </div>
            <div style={{ background:"var(--surf)", border:"1px solid var(--border)", borderRadius:8,
              overflow:"hidden", marginBottom:18, maxHeight:300, overflowY:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:"var(--card)", position:"sticky", top:0 }}>
                    {["#","Nom","Téléphone","Groupe","Montant","Ref","Validation"].map(h => (
                      <th key={h} style={{ padding:"8px 10px", color:"var(--sub)", fontWeight:700,
                        textAlign:"left", textTransform:"uppercase", letterSpacing:".4px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const err = rowErrors[i];
                    return (
                      <tr key={i} style={{
                        borderTop:"1px solid var(--border-soft)",
                        background: err ? "rgba(240,82,82,.05)" : "transparent",
                      }}>
                        <td style={{ padding:"7px 10px", color:"var(--sub)", fontSize:10 }}>{i + 2}</td>
                        {r.slice(0, 5).map((c, j) => (
                          <td key={j} style={{ padding:"7px 10px", color:"var(--text)",
                            maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c}</td>
                        ))}
                        <td style={{ padding:"7px 10px" }}>
                          {err ? (
                            <span style={{ color:"var(--red)", fontSize:10, fontWeight:600 }}>{err}</span>
                          ) : (
                            <CheckCircle size={12} color="var(--green)" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, color:"var(--sub)" }}>
                {rows.filter((_, i) => !rowErrors[i]).length} lignes valides sur {rows.length}
              </span>
              <div style={{ display:"flex", gap:10 }}>
                <button type="button" onClick={() => { setRows([]); setRowErrors([]); setState("idle"); }}
                  style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                    padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
                  Autre fichier
                </button>
                <button type="button" onClick={startImport}
                  disabled={rows.filter((_, i) => !rowErrors[i]).length === 0}
                  style={{ background:"var(--gold)", color:"#fff", border:"none",
                    padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                    fontFamily:"'Sora',sans-serif",
                    opacity: rows.filter((_, i) => !rowErrors[i]).length === 0 ? .5 : 1 }}>
                  Importer {rows.filter((_, i) => !rowErrors[i]).length} bénéficiaires
                </button>
              </div>
            </div>
          </div>
        )}

        {state === "importing" && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:36, fontWeight:800, color:"var(--gold)",
              fontFamily:"'Sora',sans-serif", marginBottom:8 }}>{progress}%</div>
            <div style={{ background:"var(--elevated)", borderRadius:8, height:8, margin:"0 0 16px",
              overflow:"hidden" }}>
              <div style={{ background:"var(--gold)", height:"100%", borderRadius:8,
                width:`${progress}%`, transition:"width .3s" }} />
            </div>
            <div style={{ color:"var(--sub)", fontSize:13 }}>Import en cours… ne fermez pas cette fenêtre</div>
          </div>
        )}

        {state === "done" && result && (
          <div>
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <div style={{ flex:1, background:"rgba(13,201,138,.1)", border:"1px solid rgba(13,201,138,.25)",
                borderRadius:8, padding:"16px 18px", textAlign:"center" }}>
                <CheckCircle size={22} color="var(--green)" style={{ marginBottom:6 }} />
                <div style={{ fontSize:24, fontWeight:800, color:"var(--green)",
                  fontFamily:"'Sora',sans-serif" }}>{result.ok}</div>
                <div style={{ color:"var(--sub)", fontSize:12 }}>importés</div>
              </div>
              <div style={{ flex:1, background: result.errors.length > 0 ? "rgba(240,82,82,.1)" : "rgba(13,201,138,.05)",
                border:`1px solid ${result.errors.length > 0 ? "var(--red-border)" : "var(--border-soft)"}`,
                borderRadius:8, padding:"16px 18px", textAlign:"center" }}>
                <AlertCircle size={22} color={result.errors.length > 0 ? "var(--red)" : "var(--sub)"} style={{ marginBottom:6 }} />
                <div style={{ fontSize:24, fontWeight:800, color: result.errors.length > 0 ? "var(--red)" : "var(--sub)",
                  fontFamily:"'Sora',sans-serif" }}>{result.errors.length}</div>
                <div style={{ color:"var(--sub)", fontSize:12 }}>erreurs</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ background:"rgba(240,82,82,.07)", border:"1px solid var(--red-sub-strong)",
                borderRadius:8, padding:"12px 14px", marginBottom:18, maxHeight:140, overflowY:"auto" }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize:11, color:"var(--red)", marginBottom:4 }}>
                    Ligne {e.line} : {e.reason}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button type="button" onClick={() => onDone(created)}
                style={{ background:"var(--gold)", color:"#fff", border:"none",
                  padding:"9px 22px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                  fontFamily:"'Sora',sans-serif" }}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal ajout bénéficiaire ───────────────────────────────────────

type BenefForm = {
  full_name: string; phone_number: string;
  group_name: string; default_amount: string; external_ref: string;
};
const EMPTY: BenefForm = { full_name:"", phone_number:"", group_name:"", default_amount:"", external_ref:"" };

function AddBeneficiaryModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (b: Beneficiary) => void;
}) {
  const [form, setForm] = useState<BenefForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof BenefForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const b = await api.tenant.createBeneficiary({
        full_name:      form.full_name,
        phone_number:   form.phone_number,
        group_name:     form.group_name,
        default_amount: form.default_amount ? parseInt(form.default_amount, 10) : 0,
        external_ref:   form.external_ref,
      });
      onCreated(b);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
        padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Ajouter un bénéficiaire
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            { label:"Nom complet *",           key:"full_name",     placeholder:"ex: OUEDRAOGO Adama" },
            { label:"Numéro de téléphone *",    key:"phone_number",  placeholder:"ex: 0070000001" },
            { label:"Groupe / Service",          key:"group_name",    placeholder:"ex: Direction financière" },
            { label:"Montant habituel (FCFA)",   key:"default_amount",placeholder:"ex: 50000", type:"number" },
            { label:"Référence externe (ERP)",   key:"external_ref",  placeholder:"ex: EMP-0042" },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key} style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)",
                marginBottom:5, fontWeight:600 }}>{label}</label>
              <input type={type ?? "text"} value={form[key as keyof BenefForm]}
                onChange={set(key as keyof BenefForm)}
                placeholder={placeholder}
                required={label.endsWith("*")}
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                  outline:"none", boxSizing:"border-box" as const }} />
            </div>
          ))}

          {error && (
            <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
              borderRadius:8, padding:"10px 14px", color:"var(--red)", fontSize:13, marginBottom:14 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button type="button" onClick={onClose}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
                padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                fontFamily:"'Sora',sans-serif" }}>
              {saving ? "Enregistrement…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal édition bénéficiaire ─────────────────────────────────────

function EditBeneficiaryModal({ benef, onClose, onUpdated }: {
  benef: Beneficiary;
  onClose: () => void;
  onUpdated: (b: Beneficiary) => void;
}) {
  const [form, setForm] = useState({
    full_name:      benef.full_name,
    group_name:     benef.group_name,
    default_amount: benef.default_amount > 0 ? String(benef.default_amount) : "",
    external_ref:   benef.external_ref,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const b = await api.tenant.updateBeneficiary(benef.id, {
        full_name:      form.full_name || undefined,
        group_name:     form.group_name || undefined,
        default_amount: form.default_amount ? parseInt(form.default_amount, 10) : undefined,
        external_ref:   form.external_ref || undefined,
      });
      onUpdated(b);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:420 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Modifier : {benef.full_name}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            { label:"Nom complet",            key:"full_name",     type:"text",   placeholder:"" },
            { label:"Groupe / Service",        key:"group_name",    type:"text",   placeholder:"" },
            { label:"Montant habituel (FCFA)", key:"default_amount",type:"number", placeholder:"" },
            { label:"Référence externe",       key:"external_ref",  type:"text",   placeholder:"" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
              <input type={type} value={form[key as keyof typeof form]} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                  outline:"none", boxSizing:"border-box" as const }} />
            </div>
          ))}
          {error && <div style={{ color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button type="button" onClick={onClose}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ background:"var(--blue)", color:"#fff", border:"none",
                padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────

export default function BeneficiariesPage() {
  const [benefs, setBenefs]       = useState<Beneficiary[]>([]);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing]     = useState<Beneficiary | null>(null);
  const [deleting, setDeleting]   = useState<Set<string>>(new Set());
  const [msg, setMsg]             = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const load = (q = "") => {
    setLoading(true);
    api.tenant.beneficiaries(1, 100, q)
      .then(r => {
        setBenefs(r.data);
        setTotal(r.total);
        const groups = [...new Set(r.data.map(b => b.group_name).filter(Boolean))] as string[];
        setAllGroups(groups);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteBenef = async (b: Beneficiary) => {
    if (!confirm(`Supprimer ${b.full_name} ?`)) return;
    setDeleting(s => new Set([...s, b.id]));
    try {
      await api.tenant.deleteBeneficiary(b.id);
      setBenefs(bs => bs.filter(x => x.id !== b.id));
      setTotal(n => n - 1);
      flash(`${b.full_name} supprimé`);
    } catch (e: unknown) {
      flash((e as Error).message);
    } finally {
      setDeleting(s => { const n = new Set(s); n.delete(b.id); return n; });
    }
  };

  return (
    <div>
      {showAdd && (
        <AddBeneficiaryModal
          onClose={() => setShowAdd(false)}
          onCreated={b => {
            setBenefs(bs => [b, ...bs]);
            setTotal(n => n + 1);
            setShowAdd(false);
            flash(`${b.full_name} ajouté`);
          }}
        />
      )}
      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onDone={newBenefs => {
            setBenefs(bs => [...newBenefs, ...bs]);
            setTotal(n => n + newBenefs.length);
            setShowImport(false);
            flash(`${newBenefs.length} bénéficiaire(s) importé(s)`);
          }}
        />
      )}
      {editing && (
        <EditBeneficiaryModal
          benef={editing}
          onClose={() => setEditing(null)}
          onUpdated={b => {
            setBenefs(bs => bs.map(x => x.id === b.id ? b : x));
            setEditing(null);
            flash(`${b.full_name} mis à jour`);
          }}
        />
      )}

      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {msg}
        </div>
      )}

      <div className="page-header" style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Bénéficiaires</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>
            Annuaire · {total} contacts
          </p>
        </div>
        <div className="page-actions" style={{ display:"flex", gap:10 }}>
          <button type="button" onClick={() => setShowImport(true)}
            style={{ background:"var(--elevated)", border:"1px solid var(--border)",
              color:"var(--mid)", padding:"9px 16px", borderRadius:9, fontWeight:600,
              fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <Upload size={13} /> Importer CSV
          </button>
          <button type="button" onClick={() => setShowAdd(true)}
            style={{ background:"var(--gold)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13,
              cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              fontFamily:"'Sora',sans-serif" }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div className="toolbar-row" style={{ display:"flex", gap:12, marginBottom:16 }}>
        <div style={{ position:"relative", flex:1 }}>
          <Search size={14} style={{ position:"absolute", left:14, top:"50%",
            transform:"translateY(-50%)", color:"var(--sub)" }} />
          <input value={search}
            onChange={e => { setSearch(e.target.value); load(e.target.value); }}
            placeholder="Rechercher par nom ou numéro..."
            style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
              borderRadius:8, padding:"10px 14px 10px 38px", color:"var(--text)",
              fontSize:13, outline:"none", boxSizing:"border-box" as const }} />
        </div>
        {allGroups.length > 0 && (
          <div style={{ position:"relative", display:"flex", alignItems:"center", gap:6 }}>
            <Filter size={13} color="var(--sub)" />
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:12,
                outline:"none" }}>
              <option value="">Tous les groupes</option>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom:12, fontSize:12, color:"var(--sub)" }}>
        {total} bénéficiaire{total !== 1 ? "s" : ""}
        {groupFilter && <span> · Groupe : <b>{groupFilter}</b></span>}
      </div>

      <div className="data-card" style={{ background:"var(--card)", border:"1px solid var(--border)",
        borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
              {["Nom","Téléphone","Opérateur","Groupe","Montant habituel","Actions"].map(h => (
                <th key={h} style={{ padding:"10px 20px", textAlign:"left",
                  color:"var(--sub)", fontSize:10, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding:"40px", textAlign:"center" }}><Spinner /></td></tr>
            ) : benefs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding:"40px", textAlign:"center",
                  color:"var(--sub)", fontSize:13 }}>
                  Aucun bénéficiaire · commencez par ajouter ou importer une liste
                </td>
              </tr>
            ) : benefs.filter(b => !groupFilter || b.group_name === groupFilter).map((b, i) => (
              <tr key={b.id}
                style={{ borderBottom: i < benefs.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <td style={{ padding:"13px 20px", fontWeight:700, fontSize:13 }}>{b.full_name}</td>
                <td style={{ padding:"13px 20px", color:"var(--mid)", fontSize:12 }}>{b.phone_number}</td>
                <td style={{ padding:"13px 20px" }}><OpBadge op={b.operator} /></td>
                <td style={{ padding:"13px 20px", color:"var(--mid)", fontSize:12 }}>{b.group_name || "—"}</td>
                <td style={{ padding:"13px 20px", color:"var(--text)", fontWeight:700, fontSize:13 }}>
                  {b.default_amount > 0 ? b.default_amount.toLocaleString("fr-FR") + " F" : "—"}
                </td>
                <td style={{ padding:"13px 20px" }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <button type="button" onClick={() => setEditing(b)}
                      aria-label={`Modifier ${b.full_name}`}
                      style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                        borderRadius:7, padding:"5px 9px", color:"var(--mid)", cursor:"pointer" }}>
                      <Pencil size={12} />
                    </button>
                    <button type="button" onClick={() => deleteBenef(b)}
                      disabled={deleting.has(b.id)}
                      aria-label={`Supprimer ${b.full_name}`}
                      style={{ background:"rgba(240,82,82,.1)", border:"1px solid var(--red-border)",
                        borderRadius:7, padding:"5px 9px", color:"var(--red)",
                        cursor: deleting.has(b.id) ? "not-allowed" : "pointer",
                        opacity: deleting.has(b.id) ? .5 : 1 }}>
                      <Trash2 size={12} />
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

function Spinner() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"20px 0" }}>
      <div style={{ width:22, height:22, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
