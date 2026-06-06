"use client";
import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:      "Super Admin",
  tenant_admin:     "Administrateur",
  tenant_manager:   "Gestionnaire",
  tenant_auditor:   "Auditeur",
};
const ROLE_COLORS: Record<UserRole, string> = {
  super_admin:    "var(--gold)",
  tenant_admin:   "var(--green)",
  tenant_manager: "var(--blue)",
  tenant_auditor: "var(--violet)",
};

// ── Modal création ─────────────────────────────────────────────────

type CreateForm = { email: string; password: string; first_name: string; last_name: string; role: UserRole };
const EMPTY_CREATE: CreateForm = { email:"", password:"", first_name:"", last_name:"", role:"tenant_manager" };

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [form, setForm]   = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value as UserRole }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const u = await api.tenant.createUser(form);
      onCreated(u);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Nouvel utilisateur
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            { label:"Prénom *",     key:"first_name", type:"text"     },
            { label:"Nom *",        key:"last_name",  type:"text"     },
            { label:"Email *",      key:"email",      type:"email"    },
            { label:"Mot de passe *", key:"password", type:"password" },
          ].map(({ label, key, type }) => (
            <div key={key} style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
              <input type={type} value={form[key as keyof CreateForm]}
                onChange={set(key as keyof CreateForm)} required
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                  outline:"none", boxSizing:"border-box" as const }} />
            </div>
          ))}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>Rôle *</label>
            <select value={form.role} onChange={set("role")}
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                outline:"none", boxSizing:"border-box" as const }}>
              <option value="tenant_admin">Administrateur</option>
              <option value="tenant_manager">Gestionnaire</option>
              <option value="tenant_auditor">Auditeur</option>
            </select>
          </div>
          {error && (
            <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
              borderRadius:8, padding:"10px 14px", color:"var(--red)", fontSize:13, marginBottom:14 }}>
              {error}
            </div>
          )}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
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
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal édition ──────────────────────────────────────────────────

function EditUserModal({ user, onClose, onUpdated }: {
  user: User; onClose: () => void; onUpdated: (u: User) => void;
}) {
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name, role: user.role as UserRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const u = await api.tenant.updateUser(user.id, form);
      onUpdated(u);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Modifier : {user.email}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {[{ label:"Prénom", key:"first_name" }, { label:"Nom", key:"last_name" }].map(({ label, key }) => (
            <div key={key} style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>{label}</label>
              <input value={form[key as "first_name"|"last_name"]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                  outline:"none", boxSizing:"border-box" as const }} />
            </div>
          ))}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:5, fontWeight:600 }}>Rôle</label>
            <select value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13,
                outline:"none", boxSizing:"border-box" as const }}>
              <option value="tenant_admin">Administrateur</option>
              <option value="tenant_manager">Gestionnaire</option>
              <option value="tenant_auditor">Auditeur</option>
            </select>
          </div>
          {error && <div style={{ color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
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

// ── Page principale ────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]     = useState<User[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [msg, setMsg]         = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const load = () => {
    setLoading(true);
    api.tenant.users()
      .then(r => { setUsers(r.data); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (u: User) => {
    try {
      const updated = await api.tenant.updateUser(u.id, { is_active: !u.is_active });
      setUsers(us => us.map(x => x.id === u.id ? updated : x));
      flash(updated.is_active ? `${u.email} activé` : `${u.email} désactivé`);
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const deleteUser = async (u: User) => {
    if (!confirm(`Supprimer ${u.email} ?`)) return;
    setDeleting(s => new Set([...s, u.id]));
    try {
      await api.tenant.deleteUser(u.id);
      setUsers(us => us.filter(x => x.id !== u.id));
      setTotal(n => n - 1);
      flash(`${u.email} supprimé`);
    } catch (e: unknown) {
      flash((e as Error).message);
    } finally {
      setDeleting(s => { const n = new Set(s); n.delete(u.id); return n; });
    }
  };

  return (
    <div>
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={u => { setUsers(us => [...us, u]); setTotal(n => n+1); setShowCreate(false); flash(`${u.email} créé`); }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={u => { setUsers(us => us.map(x => x.id === u.id ? u : x)); setEditing(null); flash("Mis à jour"); }}
        />
      )}
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {msg}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0, fontFamily:"'Sora',sans-serif" }}>
            Mon équipe
          </h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>{total} utilisateurs</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          style={{ background:"var(--gold)", color:"#fff", border:"none",
            padding:"10px 18px", borderRadius:8, fontWeight:700, fontSize:13,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Sora',sans-serif" }}>
          <Plus size={15} /> Inviter un utilisateur
        </button>
      </div>

      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        {loading ? <Spinner /> : users.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--sub)", fontSize:13 }}>
            Aucun utilisateur · invitez votre équipe
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Utilisateur","Email","Rôle","Statut","Actions"].map(h => (
                  <th key={h} style={{ padding:"10px 18px", textAlign:"left", color:"var(--sub)",
                    fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const rColor = ROLE_COLORS[u.role as UserRole] ?? "var(--mid)";
                return (
                  <tr key={u.id}
                    style={{ borderBottom: i < users.length-1 ? "1px solid var(--border-soft)" : "none" }}>
                    <td style={{ padding:"13px 18px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%",
                          background:`color-mix(in srgb, ${rColor} 12%, transparent)`,
                          border:`1px solid color-mix(in srgb, ${rColor} 30%, transparent)`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontWeight:800, fontSize:12, color:rColor }}>
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13 }}>{u.first_name} {u.last_name}</div>
                          <div style={{ color:"var(--sub)", fontSize:11 }}>
                            {u.last_login_at
                              ? `Dernière connexion : ${new Date(u.last_login_at).toLocaleDateString("fr-FR")}`
                              : "Jamais connecté"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:"13px 18px", color:"var(--mid)", fontSize:12 }}>{u.email}</td>
                    <td style={{ padding:"13px 18px" }}>
                      <span style={{ background:`color-mix(in srgb, ${rColor} 12%, transparent)`, color:rColor,
                        fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8,
                        textTransform:"uppercase" }}>
                        {ROLE_LABELS[u.role as UserRole] ?? u.role}
                      </span>
                    </td>
                    <td style={{ padding:"13px 18px" }}>
                      <span style={{ background: u.is_active ? "var(--green-sub)" : "var(--red-sub)",
                        color: u.is_active ? "var(--green)" : "var(--red)",
                        fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8 }}>
                        {u.is_active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td style={{ padding:"13px 18px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button type="button" onClick={() => setEditing(u)} title="Modifier"
                          style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                            borderRadius:7, padding:"5px 9px", color:"var(--mid)", cursor:"pointer" }}>
                          <Pencil size={12} />
                        </button>
                        <button type="button" onClick={() => toggleActive(u)}
                          title={u.is_active ? "Désactiver" : "Activer"}
                          style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                            borderRadius:7, padding:"5px 9px",
                            color: u.is_active ? "var(--red)" : "var(--green)", cursor:"pointer" }}>
                          {u.is_active ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                        </button>
                        <button type="button" onClick={() => deleteUser(u)} title="Supprimer"
                          disabled={deleting.has(u.id)}
                          style={{ background:"rgba(240,82,82,.1)", border:"1px solid var(--red-border)",
                            borderRadius:7, padding:"5px 9px", color:"var(--red)",
                            cursor: deleting.has(u.id) ? "not-allowed" : "pointer",
                            opacity: deleting.has(u.id) ? .5 : 1 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
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

function Spinner() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"40px 0" }}>
      <div style={{ width:24, height:24, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
