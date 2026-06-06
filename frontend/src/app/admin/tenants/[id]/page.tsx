"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Users, FileText, Wallet as WalletIcon, Save, Copy, Check, ExternalLink, Shield, Plus, X, UserCog, Pencil, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import type { TenantDetail, TenantStatus, User, UserRole, WalletTransaction } from "@/lib/types";
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

  // Tenant users
  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userActionMsg, setUserActionMsg] = useState("");

  // Wallet & recharge
  const [showRecharge, setShowRecharge] = useState(false);
  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
  const [walletTxTotal, setWalletTxTotal] = useState(0);

  const loadWalletTxs = (tenantId: string) => {
    api.admin.tenantWalletTransactions(tenantId, 1, 10)
      .then(r => { setWalletTxs(r.data); setWalletTxTotal(r.total); })
      .catch(() => {});
  };

  // Edit form
  const [form, setForm] = useState({
    raison_sociale: "",
    secteur: "",
    commission_rate: "",
    validation_threshold: "",
    batch_amount_limit: "",
  });

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  const loadTenantUsers = () => {
    api.admin.tenantUsers(id).then(r => setTenantUsers(r.data)).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
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
        loadWalletTxs(id);
        return api.admin.tenantUsers(id)
          .then(users => setTenantUsers(users.data))
          .catch(e => flash((e as Error).message, false));
      })
      .catch(e => {
        setData(null);
        flash((e as Error).message, false);
      })
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
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13 }}>
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
          border:"1px solid var(--gold-border)", borderRadius:8,
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
          padding:"5px 14px", borderRadius:8, fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
          {st.label}
        </span>
        {tenant.status !== "active" && tenant.status !== "prospect" && (
          <>
            <button type="button" onClick={() => router.push(`/admin/kyb/${tenant.id}`)}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
                padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
              <Shield size={14} /> Voir KYB
            </button>
            <button type="button" onClick={doActivate}
              style={{ background:"var(--green)", color:"#fff", border:"none",
                padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              Activer
            </button>
          </>
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
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
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
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:26, marginBottom:24 }}>
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

      {/* Wallet */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:26, marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:15, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Wallet
          </h2>
          <button type="button" onClick={() => setShowRecharge(true)}
            style={{ background:"var(--green)", color:"#fff", border:"none",
              padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13,
              cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <Plus size={13} /> Recharger
          </button>
        </div>

        {/* Soldes */}
        {tenant.wallet ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:20 }}>
            {[
              { label:"Disponible",   val:tenant.wallet.available_balance, color:"var(--green)" },
              { label:"Réservé",      val:tenant.wallet.reserved_balance,  color:"var(--gold)" },
              { label:"Total débité", val:tenant.wallet.total_debited,     color:"var(--blue)" },
              { label:"Commissions",  val:tenant.wallet.total_commission,  color:"var(--violet)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:"var(--surf)", border:"1px solid var(--border)",
                borderRadius:8, padding:"14px 18px" }}>
                <div style={{ color:"var(--sub)", fontSize:10, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:".5px", marginBottom:6 }}>{label}</div>
                <div style={{ color, fontSize:18, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
                  {fcfa(val)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color:"var(--sub)", fontSize:13, marginBottom:20 }}>Wallet non initialisé</div>
        )}

        {/* Derniers mouvements */}
        {walletTxs.length > 0 && (
          <>
            <div style={{ fontSize:11, color:"var(--sub)", fontWeight:700, textTransform:"uppercase",
              letterSpacing:".5px", marginBottom:10 }}>
              Derniers mouvements · {walletTxTotal} au total
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                  {["Date","Type","Référence","Montant","Solde après","Note"].map(h => (
                    <th key={h} style={{ padding:"7px 12px", textAlign:"left", color:"var(--sub)",
                      fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {walletTxs.map((tx, i) => {
                  const isCredit = tx.amount > 0;
                  const typeLabel: Record<string, { label: string; color: string }> = {
                    recharge:    { label:"Recharge",        color:"var(--green)" },
                    batch_debit: { label:"Provision batch", color:"var(--red)" },
                    refund:      { label:"Remboursement",   color:"var(--blue)" },
                    commission:  { label:"Commission",      color:"var(--gold)" },
                  };
                  const meta = typeLabel[tx.type] ?? { label:tx.type, color:"var(--mid)" };
                  return (
                    <tr key={tx.id}
                      style={{ borderBottom: i < walletTxs.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                      <td style={{ padding:"9px 12px", color:"var(--mid)", fontSize:11 }}>
                        {new Date(tx.created_at).toLocaleString("fr-FR", { dateStyle:"short", timeStyle:"short" })}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ background:`color-mix(in srgb, ${meta.color} 12%, transparent)`,
                          color:meta.color, fontSize:10, fontWeight:700, padding:"2px 8px",
                          borderRadius:8, textTransform:"uppercase" }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:11, fontFamily:"monospace" }}>
                        {tx.reference
                          ? <span style={{ color:"var(--text)", fontWeight:600 }}>{tx.reference}</span>
                          : <span style={{ color:"var(--sub)" }}>#{tx.id.slice(0, 8)}</span>}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ color: isCredit ? "var(--green)" : "var(--red)",
                          fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:3 }}>
                          {isCredit ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                          {isCredit ? "+" : "−"}{fcfa(Math.abs(tx.amount))}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px", color:"var(--text)", fontSize:12, fontWeight:600 }}>
                        {fcfa(tx.balance_after)}
                      </td>
                      <td style={{ padding:"9px 12px", color:"var(--sub)", fontSize:11 }}>
                        {tx.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {walletTxs.length === 0 && tenant.wallet && (
          <div style={{ textAlign:"center", padding:"16px 0", color:"var(--sub)", fontSize:13 }}>
            Aucun mouvement enregistré
          </div>
        )}
      </div>

      {/* Modal recharge */}
      {showRecharge && (
        <RechargeModal
          tenantId={id}
          tenantName={tenant.raison_sociale}
          onClose={() => setShowRecharge(false)}
          onSuccess={(wallet, reference) => {
            setShowRecharge(false);
            setData(d => d ? { ...d, tenant: { ...d.tenant, wallet } } : d);
            loadWalletTxs(id);
            flash(`Recharge ${reference} confirmée — solde : ${fcfa(wallet.available_balance)}`);
          }}
        />
      )}

      {/* Équipe du tenant */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:26 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:15, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Équipe · {tenantUsers.length} utilisateur{tenantUsers.length !== 1 ? "s" : ""}
          </h2>
          <button type="button" onClick={() => setShowCreateUser(true)}
            style={{ background:"var(--gold)", color:"#fff", border:"none",
              padding:"8px 14px", borderRadius:8, fontWeight:700, fontSize:12,
              cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <Plus size={13} /> Ajouter
          </button>
        </div>

        {showCreateUser && (
          <CreateTenantUserModal
            tenantId={id}
            onClose={() => setShowCreateUser(false)}
            onCreated={() => { setShowCreateUser(false); loadTenantUsers(); }}
          />
        )}

        {editingUser && (
          <EditTenantUserModal
            tenantId={id}
            user={editingUser}
            onClose={() => setEditingUser(null)}
            onSaved={() => {
              setEditingUser(null);
              loadTenantUsers();
              setUserActionMsg("Utilisateur modifié");
              setTimeout(() => setUserActionMsg(""), 2500);
            }}
          />
        )}

        {userActionMsg && (
          <div style={{ background:"var(--green-sub)", color:"var(--green)", padding:"8px 14px",
            borderRadius:8, fontSize:12, fontWeight:600, marginBottom:14 }}>
            {userActionMsg}
          </div>
        )}

        {tenantUsers.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 0", color:"var(--sub)", fontSize:13 }}>
            Aucun utilisateur pour ce tenant
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Nom", "Email", "Rôle", "Statut", "Actions"].map(h => (
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", color:"var(--sub)",
                    fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantUsers.map((u, i) => (
                <tr key={u.id} style={{
                  borderBottom: i < tenantUsers.length - 1 ? "1px solid var(--border-soft)" : "none",
                }}>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <UserCog size={14} color="var(--mid)" />
                      <span style={{ fontWeight:600, fontSize:13 }}>{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", color:"var(--mid)", fontSize:12 }}>{u.email}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:8,
                      background:"var(--gold-sub)", color:"var(--gold)", textTransform:"uppercase" }}>
                      {u.role.replace("tenant_", "")}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:8,
                      background: u.is_active ? "var(--green-sub)" : "var(--red-sub)",
                      color: u.is_active ? "var(--green)" : "var(--red)" }}>
                      {u.is_active ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:4 }}>
                      <button type="button" onClick={() => setEditingUser(u)}
                        title="Modifier l'utilisateur"
                        style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                          borderRadius:6, padding:"4px 8px", cursor:"pointer",
                          color:"var(--blue)", fontSize:11, fontWeight:600,
                          display:"flex", alignItems:"center", gap:4 }}>
                        <Pencil size={11} /> Modifier
                      </button>
                      <button type="button" onClick={async () => {
                        await api.admin.updateTenantUser(id, u.id, { is_active: !u.is_active });
                        loadTenantUsers();
                        setUserActionMsg(`Utilisateur ${u.is_active ? "désactivé" : "activé"}`);
                        setTimeout(() => setUserActionMsg(""), 2500);
                      }}
                        style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                          borderRadius:6, padding:"4px 8px", cursor:"pointer",
                          color: u.is_active ? "var(--red)" : "var(--green)",
                          fontSize:11, fontWeight:600 }}>
                        {u.is_active ? "Désactiver" : "Activer"}
                      </button>
                      <button type="button" onClick={async () => {
                        if (!confirm("Supprimer cet utilisateur ?")) return;
                        await api.admin.deleteTenantUser(id, u.id);
                        loadTenantUsers();
                        setUserActionMsg("Utilisateur supprimé");
                        setTimeout(() => setUserActionMsg(""), 2500);
                      }}
                        style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
                          borderRadius:6, padding:"4px 8px", cursor:"pointer",
                          color:"var(--red)", fontSize:11, fontWeight:600 }}>
                        Supprimer
                      </button>
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

// ── Recharge Wallet Modal ─────────────────────────────────────────

function RechargeModal({ tenantId, tenantName, onClose, onSuccess }: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onSuccess: (wallet: import("@/lib/types").Wallet, reference: string) => void;
}) {
  const [amount, setAmount]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState<{ reference: string; wallet: import("@/lib/types").Wallet } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setLoading(true);
    try {
      const res = await api.admin.rechargeWallet(tenantId, amt);
      setDone({ reference: res.reference, wallet: res.wallet });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const PRESETS = [10000, 50000, 100000, 500000, 1000000];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget && !done) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)",
        borderRadius:10, padding:30, width:460 }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
          <div>
            <h2 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
              Recharger le wallet
            </h2>
            <p style={{ margin:0, fontSize:12, color:"var(--sub)" }}>{tenantName}</p>
          </div>
          {!done && (
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)", padding:4 }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Succès ── */}
        {done ? (
          <div>
            <div style={{ background:"var(--green-sub)", border:"1px solid rgba(13,201,138,.25)",
              borderRadius:10, padding:"20px 22px", marginBottom:20, textAlign:"center" }}>
              <div style={{ fontSize:13, color:"var(--sub)", marginBottom:6 }}>Recharge confirmée</div>
              <div style={{ fontSize:22, fontWeight:800, color:"var(--green)",
                fontFamily:"'Sora',sans-serif", marginBottom:12 }}>
                +{fcfa(done.wallet.available_balance - (done.wallet.available_balance - parseInt(amount, 10)))}
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                  <span style={{ color:"var(--sub)" }}>Référence</span>
                  <code style={{ fontFamily:"monospace", fontWeight:700, color:"var(--text)",
                    background:"var(--elevated)", padding:"2px 8px", borderRadius:5 }}>
                    {done.reference}
                  </code>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                  <span style={{ color:"var(--sub)" }}>Nouveau solde disponible</span>
                  <span style={{ fontWeight:700, color:"var(--green)" }}>
                    {fcfa(done.wallet.available_balance)}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => onSuccess(done.wallet, done.reference)}
              style={{ width:"100%", background:"var(--green)", color:"#fff", border:"none",
                padding:"11px", borderRadius:9, fontWeight:700, fontSize:14,
                cursor:"pointer", fontFamily:"'Sora',sans-serif" }}>
              Fermer
            </button>
          </div>
        ) : (
          /* ── Formulaire ── */
          <form onSubmit={handleSubmit}>
            {/* Montant */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:6, fontWeight:700 }}>
                MONTANT (FCFA) *
              </label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Ex : 500000"
                required
                autoFocus
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"11px 14px", color:"var(--text)", fontSize:16,
                  fontWeight:700, outline:"none", boxSizing:"border-box" as const,
                  fontFamily:"'Sora',sans-serif" }}
              />
              <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                {PRESETS.map(p => (
                  <button key={p} type="button"
                    onClick={() => setAmount(String(p))}
                    style={{ background: amount === String(p) ? "var(--green)" : "var(--elevated)",
                      color: amount === String(p) ? "#fff" : "var(--mid)",
                      border:`1px solid ${amount === String(p) ? "var(--green)" : "var(--border)"}`,
                      borderRadius:7, padding:"4px 10px", fontSize:11, fontWeight:600,
                      cursor:"pointer", transition:"all .15s" }}>
                    {fcfa(p)}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
                color:"var(--red)", borderRadius:8, padding:"10px 14px", fontSize:13,
                fontWeight:600, marginBottom:16 }}>
                {error}
              </div>
            )}

            {amount && parseInt(amount, 10) > 0 && (
              <div style={{ background:"var(--green-sub)", border:"1px solid rgba(13,201,138,.2)",
                borderRadius:8, padding:"12px 16px", marginBottom:20,
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:"var(--sub)", fontWeight:600 }}>Crédit à ajouter</span>
                <span style={{ fontSize:18, fontWeight:800, color:"var(--green)",
                  fontFamily:"'Sora',sans-serif" }}>
                  +{fcfa(parseInt(amount, 10))}
                </span>
              </div>
            )}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button type="button" onClick={onClose}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"10px 20px", borderRadius:9,
                  cursor:"pointer", fontSize:13, fontWeight:600 }}>
                Annuler
              </button>
              <button type="submit" disabled={loading}
                style={{ background:"var(--green)", color:"#fff", border:"none",
                  padding:"10px 24px", borderRadius:9, fontWeight:700, fontSize:13,
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1,
                  display:"flex", alignItems:"center", gap:6, fontFamily:"'Sora',sans-serif" }}>
                <WalletIcon size={14} />
                {loading ? "Recharge en cours…" : "Confirmer la recharge"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Create Tenant User Modal ───────────────────────────────────────

function CreateTenantUserModal({ tenantId, onClose, onCreated }: {
  tenantId: string; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    email: "", password: "", first_name: "", last_name: "", role: "tenant_manager",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.admin.createTenantUser(tenantId, form as { email: string; password: string; first_name: string; last_name: string; role: UserRole });
      onCreated();
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Ajouter un utilisateur
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <Row label="Prénom *"><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required /></Row>
          <Row label="Nom *"><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required /></Row>
          <Row label="Email *"><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></Row>
          <Row label="Mot de passe *"><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required /></Row>
          <Row label="Rôle">
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13, outline:"none" }}>
              <option value="tenant_admin">Admin</option>
              <option value="tenant_manager">Gestionnaire</option>
              <option value="tenant_auditor">Auditeur</option>
            </select>
          </Row>
          {error && <div style={{ color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button type="button" onClick={onClose}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
                padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
              {saving ? "Création…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTenantUserModal({ tenantId, user, onClose, onSaved }: {
  tenantId: string; user: User; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    is_active: user.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.admin.updateTenantUser(tenantId, user.id, form);
      onSaved();
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Modifier l&apos;utilisateur
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <Row label="Prénom *">
            <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required />
          </Row>
          <Row label="Nom *">
            <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required />
          </Row>
          <Row label="Rôle">
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13, outline:"none" }}>
              <option value="tenant_admin">Admin</option>
              <option value="tenant_manager">Gestionnaire</option>
              <option value="tenant_auditor">Auditeur</option>
            </select>
          </Row>
          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13,
            color:"var(--mid)", fontWeight:600, margin:"2px 0 14px" }}>
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Compte actif
          </label>
          {error && <div style={{ color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button type="button" onClick={onClose}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
                padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
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
      boxSizing:"border-box", ...props.style }} />
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
