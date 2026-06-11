"use client";
import { useEffect, useState } from "react";
import { Shield, Plus, X, Save, UserCog, Check, Ban } from "lucide-react";
import { api } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const load = () => {
    setLoading(true);
    api.admin.adminUsers()
      .then(r => setUsers(r.data))
      .catch((e: unknown) => flash(e instanceof Error ? e.message : "Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const handleDelete = async (user: User) => {
    if (!confirm(`Supprimer ${user.first_name} ${user.last_name} ?`)) return;
    try {
      await api.admin.deleteAdminUser(user.id);
      setUsers(us => us.filter(u => u.id !== user.id));
      flash("Admin supprimé");
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.admin.updateAdminUser(user.id, { is_active: !user.is_active });
      setUsers(us => us.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
      flash(user.is_active ? "Admin désactivé" : "Admin activé");
    } catch (e: unknown) { flash((e as Error).message); }
  };

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13, zIndex:1000 }}>
          {msg}
        </div>
      )}

      {showCreate && (
        <CreateAdminModal onClose={() => setShowCreate(false)} onCreated={(u) => {
          setUsers(us => [u, ...us]);
          setShowCreate(false);
          flash(`Admin ${u.first_name} ${u.last_name} créé`);
        }} />
      )}

      {editing && <EditAdminModal userId={editing} onClose={() => setEditing(null)} onUpdated={(u) => {
        setUsers(us => us.map(x => x.id === u.id ? u : x));
        setEditing(null);
        flash("Admin modifié");
      }} />}

      <div className="page-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0,
            fontFamily:"'Sora',sans-serif" }}>Administrateurs</h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>
            {users.length} administrateur{users.length !== 1 ? "s" : ""} de la plateforme
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          style={{ background:"var(--gold)", color:"#fff", border:"none",
            padding:"10px 18px", borderRadius:8, fontWeight:700, fontSize:13,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Sora',sans-serif" }}>
          <Plus size={15} /> Nouvel admin
        </button>
      </div>

      <div className="data-card" style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--sub)" }}>Chargement…</div>
        ) : users.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--sub)", fontSize:14 }}>
            Aucun administrateur
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                {["Nom", "Email", "Rôle", "Statut", "Dernière connexion", "Actions"].map(h => (
                  <th key={h} style={{ padding:"10px 18px", textAlign:"left",
                    color:"var(--sub)", fontSize:10, fontWeight:700,
                    textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{
                  borderBottom: i < users.length - 1 ? "1px solid var(--border-soft)" : "none",
                  opacity: u.is_active ? 1 : .5,
                }}>
                  <td style={{ padding:"13px 18px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:32, background:"var(--gold-sub)",
                        border:"1px solid var(--gold-border)", borderRadius:8,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Shield size={14} color="var(--gold)" />
                      </div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13 }}>{u.first_name} {u.last_name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:"13px 18px", color:"var(--mid)", fontSize:13 }}>{u.email}</td>
                  <td style={{ padding:"13px 18px" }}>
                    <span style={{ background:"var(--gold-sub)", color:"var(--gold)",
                      fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8,
                      textTransform:"uppercase" }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td style={{ padding:"13px 18px" }}>
                    <span style={{
                      background: u.is_active ? "var(--green-sub)" : "var(--red-sub)",
                      color: u.is_active ? "var(--green)" : "var(--red)",
                      fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:8,
                    }}>
                      {u.is_active ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td style={{ padding:"13px 18px", color:"var(--sub)", fontSize:12 }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("fr-FR") : "Jamais"}
                  </td>
                  <td style={{ padding:"13px 18px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button type="button" onClick={() => setEditing(u.id)}
                        style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                          borderRadius:7, padding:"5px 10px", color:"var(--blue)",
                          cursor:"pointer", fontSize:11, fontWeight:600 }}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => handleToggleActive(u)}
                        style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                          borderRadius:7, padding:"5px 10px",
                          color: u.is_active ? "var(--red)" : "var(--green)",
                          cursor:"pointer", fontSize:11, fontWeight:600,
                          display:"flex", alignItems:"center", gap:4 }}>
                        {u.is_active ? <Ban size={11} /> : <Check size={11} />}
                        {u.is_active ? "Désactiver" : "Activer"}
                      </button>
                      <button type="button" onClick={() => handleDelete(u)}
                        style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
                          borderRadius:7, padding:"5px 10px", color:"var(--red)",
                          cursor:"pointer", fontSize:11, fontWeight:600 }}>
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

// ── Create Modal ───────────────────────────────────────────────────

function CreateAdminModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (u: User) => void;
}) {
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const user = await api.admin.createAdminUser(form);
      onCreated(user);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Nouvel administrateur
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
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────

function EditAdminModal({ userId, onClose, onUpdated }: {
  userId: string; onClose: () => void; onUpdated: (u: User) => void;
}) {
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.admin.adminUsers().then(r => {
      const u = r.data.find(x => x.id === userId);
      if (u) setForm({ first_name: u.first_name, last_name: u.last_name });
    });
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const user = await api.admin.updateAdminUser(userId, form);
      onUpdated(user);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:28, width:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Modifier l&apos;admin
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <Row label="Prénom"><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></Row>
          <Row label="Nom"><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></Row>
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
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                display:"flex", alignItems:"center", gap:6 }}>
              <Save size={13} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers UI ─────────────────────────────────────────────────────

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
