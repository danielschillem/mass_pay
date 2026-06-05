"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Users, FileText, Wallet as WalletIcon, Save, Copy, Check, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import type { TenantDetail, TenantStatus } from "@/lib/types";
import { fcfa } from "@/lib/types";

const STATUS_STYLE: Record<TenantStatus, { label: string; color: string }> = {
  prospect:    { label: "Prospect",     color: "var(--sub)" },
  kyb_pending: { label: "KYB en cours", color: "var(--gold)" },
  active:      { label: "Actif",        color: "var(--green)" },
  suspended:   { label: "Suspendu",     color: "var(--red)" },
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData]       = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied]   = useState(false);

  // Edit form
  const [form, setForm] = useState({
    raison_sociale: "",
    secteur: "",
    commission_rate: "",
    validation_threshold: "",
    batch_amount_limit: "",
  });

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    api.admin.getTenant(id)
      .then(d => {
        setData(d);
        setForm({
          raison_sociale: d.tenant.raison_sociale,
          secteur: d.tenant.secteur,
          commission_rate: String(d.tenant.commission_rate),
          validation_threshold: String(d.tenant.validation_threshold),
          batch_amount_limit: String(d.tenant.batch_amount_limit),
        });
      })
      .catch(e => flash((e as Error).message, false))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    try {
      const updated = await api.admin.updateTenant(id, {
        raison_sociale: form.raison_sociale,
        secteur: form.secteur,
        commission_rate: parseFloat(form.commission_rate),
        validation_threshold: parseInt(form.validation_threshold, 10),
        batch_amount_limit: parseInt(form.batch_amount_limit, 10),
      });
      setData(d => d ? { ...d, tenant: updated } : d);
      flash("Modifications enregistrées");
    } catch (e: unknown) { flash((e as Error).message, false); }
    finally { setSaving(false); }
  };

  const doActivate = async () => {
    if (!data) return;
    try {
      await api.admin.activate(data.tenant.id);
      setData(d => d ? { ...d, tenant: { ...d.tenant, status: "active" } } : d);
      flash("Tenant activé");
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  const doSuspend = async () => {
    if (!data) return;
    if (!confirm("Suspendre ce tenant ?")) return;
    try {
      await api.admin.suspend(data.tenant.id);
      setData(d => d ? { ...d, tenant: { ...d.tenant, status: "suspended" } } : d);
      flash("Tenant suspendu");
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  if (loading) return <PageSpinner />;
  if (!data) return <div style={{ color:"var(--red)", padding:40, textAlign:"center" }}>Tenant introuvable</div>;

  const { tenant, user_count, benef_count, batch_count } = data;
  const st = STATUS_STYLE[tenant.status] ?? STATUS_STYLE.prospect;

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000,
          background: msg.ok ? "var(--green)" : "var(--red)",
          color: msg.ok ? "#fff" : "#fff",
          padding:"12px 20px", borderRadius:10, fontWeight:700, fontSize:13 }}>
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:26 }}>
        <button type="button" onClick={() => router.back()} aria-label="Retour"
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8,
            padding:"7px 10px", cursor:"pointer", color:"var(--mid)" }}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ width:40, height:40, background:"var(--gold-sub)",
          border:"1px solid var(--gold-border)", borderRadius:10,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Building2 size={18} color="var(--gold)" />
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            {tenant.raison_sociale}
          </h1>
          <p style={{ margin:"3px 0 0", color:"var(--sub)", fontSize:12 }}>
            {tenant.slug} · IFU {tenant.ifu}
          </p>
        </div>
        <span style={{ background:`color-mix(in srgb, ${st.color} 12%, transparent)`, color:st.color,
          padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
          {st.label}
        </span>
        {tenant.status !== "active" && tenant.status !== "prospect" && (
          <button type="button" onClick={doActivate}
            style={{ background:"var(--green)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            Activer
          </button>
        )}
        {tenant.status === "active" && (
          <button type="button" onClick={doSuspend}
            style={{ background:"var(--red-sub)", color:"var(--red)",
              border:"1px solid var(--red-border)", padding:"9px 16px", borderRadius:9,
              fontWeight:700, fontSize:13, cursor:"pointer" }}>
            Suspendre
          </button>
        )}
      </div>

      {/* Compteurs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Utilisateurs",  val:user_count,  icon:<Users size={16} color="var(--blue)" />,       color:"var(--blue)" },
          { label:"Bénéficiaires", val:benef_count, icon:<Users size={16} color="var(--green)" />,       color:"var(--green)" },
          { label:"Batches",       val:batch_count, icon:<FileText size={16} color="var(--gold)" />,    color:"var(--gold)" },
          { label:"Wallet dispo",
            val: tenant.wallet ? fcfa(tenant.wallet.available_balance) : "—",
            icon:<WalletIcon size={16} color="var(--violet)" />, color:"var(--violet)" },
        ].map(({ label, val, icon, color }) => (
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12,
            padding:"16px 18px", display:"flex", alignItems:"flex-start", gap:12 }}>
            <div style={{ width:36, height:36, background:`color-mix(in srgb, ${color} 12%, transparent)`,
              border:`1px solid color-mix(in srgb, ${color} 24%, transparent)`, borderRadius:9,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {icon}
            </div>
            <div>
              <div style={{ color:"var(--sub)", fontSize:10, fontWeight:700,
                textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>{label}</div>
              <div style={{ color:"var(--text)", fontSize:20, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Formulaire d'édition */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:26 }}>
        <h2 style={{ margin:"0 0 20px", fontSize:15, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
          Informations & Configuration
        </h2>
        <form onSubmit={handleSave}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            {[
              { label:"Raison sociale", key:"raison_sociale", type:"text" },
              { label:"Secteur",        key:"secteur",        type:"text" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
                <input type={type} value={form[key as keyof typeof form]}
                  onChange={setField(key as keyof typeof form)}
                  style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                    borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                    outline:"none", boxSizing:"border-box" as const }} />
              </div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>
            {[
              { label:"Taux commission (ex: 0.015)", key:"commission_rate",       type:"number", step:"0.001" },
              { label:"Seuil double validation (FCFA)", key:"validation_threshold", type:"number", step:"1"     },
              { label:"Plafond batch (FCFA)",          key:"batch_amount_limit",   type:"number", step:"1"     },
            ].map(({ label, key, type, step }) => (
              <div key={key}>
                <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
                <input type={type} step={step} value={form[key as keyof typeof form]}
                  onChange={setField(key as keyof typeof form)}
                  style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                    borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                    outline:"none", boxSizing:"border-box" as const }} />
              </div>
            ))}
          </div>

          {/* Read-only info + URL */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            {[
              { label:"RCCM", val:tenant.rccm },
              { label:"IFU",  val:tenant.ifu  },
            ].map(({ label, val }) => (
              <div key={label}>
                <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
                <div style={{ background:"var(--surf)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--sub)", fontSize:13, fontFamily:"monospace" }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* URL d'accès */}
          <div style={{ marginBottom:24 }}>
            <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>
              URL d&apos;accès tenant
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, background:"var(--surf)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <ExternalLink size={13} color="var(--blue)" style={{ flexShrink:0 }} />
                <code style={{ fontSize:12, color:"var(--blue)", fontFamily:"monospace",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {typeof window !== "undefined" ? window.location.origin : ""}/login?tenant={tenant.slug}
                </code>
              </div>
              <button type="button"
                onClick={() => {
                  const url = `${window.location.origin}/login?tenant=${tenant.slug}`;
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                title="Copier l'URL"
                style={{ background: copied ? "rgba(13,201,138,.15)" : "var(--elevated)",
                  border:`1px solid ${copied ? "rgba(13,201,138,.3)" : "var(--border)"}`,
                  borderRadius:8, padding:"9px 12px", cursor:"pointer",
                  color: copied ? "var(--green)" : "var(--mid)",
                  display:"flex", alignItems:"center", gap:5, fontSize:12,
                  fontWeight:600, transition:"all .2s", flexShrink:0 }}>
                {copied ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
              </button>
            </div>
            <div style={{ fontSize:10, color:"var(--sub)", marginTop:5 }}>
              Slug : <code style={{ color:"var(--mid)", fontFamily:"monospace" }}>{tenant.slug}</code>
              &nbsp;· Partagez cette URL avec l&apos;administrateur du tenant pour qu&apos;il se connecte
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button type="submit" disabled={saving}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
                padding:"10px 22px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                display:"flex", alignItems:"center", gap:6,
                fontFamily:"'Sora',sans-serif" }}>
              <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
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
