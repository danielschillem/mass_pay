"use client";
import { useEffect, useState } from "react";
import { Mail, CheckCircle2, XCircle, Send, RefreshCw, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

type MailStatus = { provider: string; configured: boolean };
type Msg = { text: string; ok: boolean };

export default function MailAdminPage() {
  const [status, setStatus]   = useState<MailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo]           = useState("");
  const [msg, setMsg]         = useState<Msg | null>(null);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadStatus = () => {
    setLoading(true);
    api.admin.mailStatus()
      .then(s => setStatus(s))
      .catch(() => flash("Impossible de charger le statut mail.", false))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStatus(); }, []);

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await api.admin.mailTest(to.trim() || undefined);
      flash(`Email de test envoyé via ${res.provider}`);
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Erreur lors de l'envoi", false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "'Sora',sans-serif" }}>
          Service Mail
        </h1>
        <p style={{ color: "var(--sub)", fontSize: 13, margin: "4px 0 0" }}>
          Statut du provider transactionnel et envoi de test
        </p>
      </div>

      {msg && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          background: msg.ok ? "var(--green)" : "var(--red)",
          color: "#fff", padding: "12px 20px", borderRadius: 8,
          fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
        }}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 800 }}>

        {/* Statut */}
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "22px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: "'Sora',sans-serif" }}>
              Statut du provider
            </h2>
            <button type="button" onClick={loadStatus} disabled={loading}
              style={{ background: "var(--elevated)", border: "1px solid var(--border)",
                color: "var(--mid)", borderRadius: 8, padding: "6px 10px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <RefreshCw size={13} className={loading ? "spin" : ""} />
            </button>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
              <div className="spinner" />
            </div>
          ) : status ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: status.configured ? "var(--green-sub)" : "var(--red-sub)",
                  border: `1px solid ${status.configured ? "rgba(13,201,138,.25)" : "var(--red-border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {status.configured
                    ? <CheckCircle2 size={18} color="var(--green)" />
                    : <XCircle size={18} color="var(--red)" />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: status.configured ? "var(--green)" : "var(--red)" }}>
                    {status.configured ? "Opérationnel" : "Non configuré"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>
                    Provider : <code style={{ fontFamily: "monospace", color: "var(--mid)" }}>{status.provider || "–"}</code>
                  </div>
                </div>
              </div>

              {!status.configured && (
                <div style={{
                  background: "var(--red-sub)", border: "1px solid var(--red-border)",
                  borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--red)",
                }}>
                  <strong>Action requise :</strong> configurez les variables d&apos;environnement
                  SMTP ou le provider transactionnel dans le backend.
                </div>
              )}

              {[
                { label: "Provider actif", val: status.provider || "–" },
                { label: "Notifications KYB", val: status.configured ? "Actives" : "Inactives" },
                { label: "Emails tenant", val: status.configured ? "Activés" : "Désactivés" },
              ].map(({ label, val }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  borderBottom: "1px solid var(--border-soft)", paddingBottom: 10,
                }}>
                  <span style={{ fontSize: 12, color: "var(--sub)" }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--red)", fontSize: 13 }}>Erreur de chargement</div>
          )}
        </div>

        {/* Test */}
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "22px 24px",
        }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 800, fontFamily: "'Sora',sans-serif" }}>
            Envoyer un email de test
          </h2>
          <form onSubmit={handleTest}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "var(--mid)", fontWeight: 700, marginBottom: 6 }}>
                DESTINATAIRE (optionnel — votre email par défaut)
              </label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="admin@example.com"
                style={{
                  width: "100%", background: "var(--elevated)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{
              background: "var(--elevated)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: "var(--sub)",
            }}>
              <div style={{ fontWeight: 700, color: "var(--mid)", marginBottom: 6 }}>Contenu de test :</div>
              <div>Sujet : <em>Test email MynaPay</em></div>
              <div style={{ marginTop: 4 }}>Corps : confirmation de bon fonctionnement du service mail</div>
            </div>

            <button type="submit" disabled={sending || !status?.configured}
              style={{
                width: "100%", background: "var(--gold)", color: "#fff",
                border: "none", padding: "11px", borderRadius: 9,
                fontWeight: 700, fontSize: 13, cursor: (sending || !status?.configured) ? "not-allowed" : "pointer",
                opacity: (sending || !status?.configured) ? .6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, fontFamily: "'Sora',sans-serif",
              }}>
              <Send size={14} />
              {sending ? "Envoi en cours…" : "Envoyer le test"}
            </button>

            {!status?.configured && (
              <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--red)", textAlign: "center" }}>
                Le provider mail n&apos;est pas configuré
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Logs d'envoi futurs */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "22px 24px", marginTop: 16, maxWidth: 800,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mail size={16} color="var(--sub)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Emails transactionnels configurés</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 4 }}>
              Activation tenant · Rejet KYB · Alertes batch
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin .8s linear infinite}`}</style>
    </div>
  );
}
