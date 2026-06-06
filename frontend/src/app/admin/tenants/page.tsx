"use client";
import { useEffect, useState } from "react";
import { Search, Plus, CheckCircle2, Ban, Wallet, X, ChevronDown, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

// ── Modale création tenant ─────────────────────────────────────────

type CreateForm = {
  raison_sociale: string; rccm: string; ifu: string; secteur: string;
  commission_rate: string;
  admin_email: string; admin_password: string; admin_first_name: string; admin_last_name: string;
};

const EMPTY_FORM: CreateForm = {
  raison_sociale: "", rccm: "", ifu: "", secteur: "",
  commission_rate: "1.5",
  admin_email: "", admin_password: "", admin_first_name: "", admin_last_name: "",
};

function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Tenant) => void }) {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.admin.createTenant({
        ...form,
        commission_rate: parseFloat(form.commission_rate) / 100,
      });
      onCreated(res.tenant);
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
        padding:28, width:520, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Nouveau tenant
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <Section title="Entreprise" />
          <Row label="Raison sociale *"><Input value={form.raison_sociale} onChange={set("raison_sociale")} required /></Row>
          <Row label="RCCM *"><Input value={form.rccm} onChange={set("rccm")} required /></Row>
          <Row label="IFU *"><Input value={form.ifu} onChange={set("ifu")} required /></Row>
          <Row label="Secteur"><Input value={form.secteur} onChange={set("secteur")} /></Row>
          <Row label="Taux de commission (%)">
            <Input type="number" step="0.1" min="0" max="10" value={form.commission_rate} onChange={set("commission_rate")} />
          </Row>

          <Section title="Admin du tenant" />
          <Row label="Prénom *"><Input value={form.admin_first_name} onChange={set("admin_first_name")} required /></Row>
          <Row label="Nom *"><Input value={form.admin_last_name} onChange={set("admin_last_name")} required /></Row>
          <Row label="Email *"><Input type="email" value={form.admin_email} onChange={set("admin_email")} required /></Row>
          <Row label="Mot de passe *"><Input type="password" value={form.admin_password} onChange={set("admin_password")} required /></Row>

          {error && (
            <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
              borderRadius:8, padding:"10px 14px", color:"var(--red)", fontSize:13, marginBottom:16 }}>
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
              {saving ? "Création…" : "Créer le tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modale recharge wallet ─────────────────────────────────────────

function RechargeModal({ tenant, onClose, onDone }: { tenant: Tenant; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [confirmedReference, setConfirmedReference] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) { setError("Montant invalide"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await api.admin.rechargeWallet(tenant.id, n);
      setConfirmedReference(res.reference);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  if (confirmedReference) {
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:400 }}>
          <div style={{ background:"var(--green-sub)", border:"1px solid rgba(13,201,138,.25)",
            borderRadius:8, padding:"16px 20px", marginBottom:20, textAlign:"center" as const }}>
            <div style={{ fontSize:12, color:"var(--sub)", marginBottom:6 }}>Recharge confirmée</div>
            <div style={{ fontSize:20, fontWeight:800, color:"var(--green)", fontFamily:"'Sora',sans-serif", marginBottom:10 }}>
              +{parseInt(amount, 10).toLocaleString("fr-FR")} FCFA
            </div>
            <div style={{ fontSize:12, color:"var(--sub)" }}>
              Référence : <code style={{ fontFamily:"monospace", fontWeight:700, color:"var(--text)" }}>{confirmedReference}</code>
            </div>
          </div>
          <button type="button" onClick={onDone}
            style={{ width:"100%", background:"var(--green)", color:"#fff", border:"none",
              padding:"10px", borderRadius:9, fontWeight:700, fontSize:14, cursor:"pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h2 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
              Recharger le wallet
            </h2>
            <p style={{ margin:0, fontSize:12, color:"var(--sub)" }}>{tenant.raison_sociale}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <Row label="Montant (FCFA) *">
            <Input type="number" min="1" value={amount}
              onChange={e => setAmount(e.target.value)} required placeholder="ex: 500000" autoFocus />
          </Row>
          {error && <div style={{ color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button type="button" onClick={onClose}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ background:"var(--green)", color:"#fff", border:"none",
                padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
              {saving ? "Recharge en cours…" : "Confirmer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers UI ─────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return (
    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px",
      color:"var(--sub)", marginBottom:10, marginTop:18, borderBottom:"1px solid var(--border)", paddingBottom:6 }}>
      {title}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
      borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13, outline:"none",
      boxSizing:"border-box" as const, ...props.style }} />
  );
}

// ── Composant principal ────────────────────────────────────────────

export default function AdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants]       = useState<Tenant[]>([]);
  const [total, setTotal]           = useState(0);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [recharging, setRecharging] = useState<Tenant | null>(null);
  const [actionMsg, setActionMsg]   = useState("");
  const [openMenu, setOpenMenu]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.admin.tenants(1, 50)
      .then(r => { setTenants(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(""), 3000); };

  const activate = async (t: Tenant) => {
    try {
      await api.admin.activate(t.id);
      setTenants(ts => ts.map(x => x.id === t.id ? { ...x, status: "active" } : x));
      flash(`${t.raison_sociale} activé`);
    } catch (e: unknown) { flash((e as Error).message); }
    setOpenMenu(null);
  };

  const suspend = async (t: Tenant) => {
    try {
      await api.admin.suspend(t.id);
      setTenants(ts => ts.map(x => x.id === t.id ? { ...x, status: "suspended" } : x));
      flash(`${t.raison_sociale} suspendu`);
    } catch (e: unknown) { flash((e as Error).message); }
    setOpenMenu(null);
  };

  const filtered = tenants.filter(t =>
    t.raison_sociale.toLowerCase().includes(search.toLowerCase()) ||
    t.ifu.includes(search)
  );

  return (
    <div>
      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={t => {
            setTenants(ts => [t, ...ts]);
            setTotal(n => n + 1);
            setShowCreate(false);
            flash(`Tenant ${t.raison_sociale} créé`);
          }}
        />
      )}
      {recharging && (
        <RechargeModal
          tenant={recharging}
          onClose={() => setRecharging(null)}
          onDone={() => { setRecharging(null); load(); flash("Wallet rechargé"); }}
        />
      )}

      {actionMsg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {actionMsg}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Tenants</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>
            {total} entreprises enregistrées
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          style={{ background:"var(--gold)", color:"#fff", border:"none",
            padding:"10px 18px", borderRadius:8, fontWeight:700, fontSize:13,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Sora',sans-serif" }}>
          <Plus size={15} /> Nouveau tenant
        </button>
      </div>

      <div style={{ position:"relative", marginBottom:18 }}>
        <Search size={14} style={{ position:"absolute", left:14, top:"50%",
          transform:"translateY(-50%)", color:"var(--sub)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou IFU..."
          style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
            borderRadius:8, padding:"10px 14px 10px 38px", color:"var(--text)",
            fontSize:13, outline:"none", boxSizing:"border-box" as const }} />
      </div>

      <div style={{ background:"var(--card)", border:"1px solid var(--border)",
        borderRadius:8, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--sub)" }}>Chargement…</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Entreprise","URL / Slug","Commission","Volume total","Statut","Actions"].map(h => (
                  <th key={h} style={{ padding:"10px 18px", textAlign:"left",
                    color:"var(--sub)", fontSize:10, fontWeight:700,
                    textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                  <td style={{ padding:"13px 18px", cursor:"pointer" }}
                    onClick={() => router.push(`/admin/tenants/${t.id}`)}>
                    <div style={{ fontWeight:700, fontSize:13, color:"var(--text)" }}>{t.raison_sociale}</div>
                    <div style={{ color:"var(--sub)", fontSize:11, marginTop:2 }}>{t.secteur}</div>
                  </td>
                  <td style={{ padding:"13px 18px" }}>
                    <div style={{ fontFamily:"monospace", fontSize:12, color:"var(--blue)", fontWeight:600 }}>
                      {t.slug}
                    </div>
                    <div style={{ fontSize:10, color:"var(--sub)", marginTop:2 }}>IFU : {t.ifu}</div>
                  </td>
                  <td style={{ padding:"13px 18px", color:"var(--gold)", fontSize:13, fontWeight:600 }}>
                    {(t.commission_rate * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding:"13px 18px", color:"var(--text)", fontSize:13, fontWeight:600 }}>
                    {t.wallet ? shortFcfa(t.wallet.total_debited) : "—"}
                  </td>
                  <td style={{ padding:"13px 18px" }}><Badge type={t.status} /></td>
                  <td style={{ padding:"13px 18px" }}>
                    <div style={{ position:"relative", display:"inline-block" }}>
                      <button type="button" onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                        style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                          borderRadius:7, padding:"5px 10px", color:"var(--mid)",
                          cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                        Actions <ChevronDown size={11} />
                      </button>
                      {openMenu === t.id && (
                        <div style={{ position:"absolute", right:0, top:"calc(100% + 4px)",
                          background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8,
                          zIndex:99, minWidth:160, overflow:"hidden" }}
                          onMouseLeave={() => setOpenMenu(null)}>
                          {t.status !== "active" && (
                            <MenuBtn icon={<CheckCircle2 size={12} />} label="Activer"
                              color="var(--green)" onClick={() => activate(t)} />
                          )}
                          {t.status !== "suspended" && (
                            <MenuBtn icon={<Ban size={12} />} label="Suspendre"
                              color="var(--red)" onClick={() => suspend(t)} />
                          )}
                          <MenuBtn icon={<Wallet size={12} />} label="Recharger wallet"
                            color="var(--blue)" onClick={() => { setRecharging(t); setOpenMenu(null); }} />
                          <MenuBtn icon={<ExternalLink size={12} />} label="Voir le détail"
                            color="var(--mid)" onClick={() => router.push(`/admin/tenants/${t.id}`)} />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MenuBtn({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      style={{ width:"100%", background:"none", border:"none", padding:"10px 14px",
        textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center",
        gap:8, color, fontSize:13, fontWeight:600 }}>
      {icon} {label}
    </button>
  );
}
