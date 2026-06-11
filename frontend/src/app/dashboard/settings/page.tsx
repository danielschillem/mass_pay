"use client";
import { useEffect, useState } from "react";
import {
  ShieldCheck, ShieldOff, Copy, Check, AlertTriangle, CheckCircle2, KeyRound, Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";

type Phase = "idle" | "setup" | "confirm" | "done";
type Msg   = { text: string; ok: boolean };

export default function SettingsPage() {
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [loading, setLoading]         = useState(true);
  const [phase, setPhase]             = useState<Phase>("idle");
  const [secret, setSecret]           = useState("");
  const [qrUri, setQrUri]             = useState("");
  const [code, setCode]               = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [working, setWorking]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [msg, setMsg]                 = useState<Msg | null>(null);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  useEffect(() => {
    api.me()
      .then(r => setTotpEnabled(r.user.totp_enabled))
      .catch(() => flash("Impossible de charger les paramètres.", false))
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async () => {
    setWorking(true);
    try {
      const r = await api.setup2FA();
      setSecret(r.secret);
      setQrUri(r.qr_uri);
      setPhase("setup");
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Erreur lors de la configuration", false);
    } finally {
      setWorking(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setWorking(true);
    try {
      await api.confirm2FA(code);
      setTotpEnabled(true);
      setPhase("done");
      flash("Authentification à deux facteurs activée !");
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Code incorrect", false);
    } finally {
      setWorking(false);
    }
  };

  const handleDisable = async () => {
    if (disableCode.length !== 6) {
      flash("Entrez le code 2FA à 6 chiffres pour désactiver.", false);
      return;
    }
    setWorking(true);
    try {
      await api.disable2FA(disableCode);
      setTotpEnabled(false);
      setPhase("idle");
      setSecret("");
      setQrUri("");
      setDisableCode("");
      flash("Authentification à deux facteurs désactivée.");
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Erreur lors de la désactivation", false);
    } finally {
      setWorking(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrImageUrl = qrUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&ecc=M&data=${encodeURIComponent(qrUri)}`
    : "";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "'Sora',sans-serif" }}>
          Paramètres de sécurité
        </h1>
        <p style={{ color: "var(--sub)", fontSize: 13, margin: "4px 0 0" }}>
          Gérez l&apos;authentification à deux facteurs de votre compte
        </p>
      </div>

      {msg && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          background: msg.ok ? "var(--green)" : "var(--red)", color: "#fff",
          padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      <div style={{ maxWidth: 560 }}>
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>

          {/* Header statut */}
          <div style={{
            padding: "20px 24px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              background: totpEnabled ? "var(--green-sub)" : "var(--elevated)",
              border: `1px solid ${totpEnabled ? "rgba(13,201,138,.25)" : "var(--border)"}`,
            }}>
              {totpEnabled ? <ShieldCheck size={20} color="var(--green)" /> : <ShieldOff size={20} color="var(--sub)" />}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, fontFamily: "'Sora',sans-serif" }}>
                Authentification à deux facteurs (TOTP)
              </div>
              <div style={{ fontSize: 12, color: totpEnabled ? "var(--green)" : "var(--sub)", marginTop: 3, fontWeight: 600 }}>
                {loading ? "Chargement…" : totpEnabled ? "Activée — votre compte est protégé" : "Désactivée — recommandée pour les comptes admin"}
              </div>
            </div>
          </div>

          {/* Contenu */}
          <div style={{ padding: "22px 24px" }}>

            {/* État idle — bouton activation */}
            {(phase === "idle" || phase === "done") && !totpEnabled && (
              <div>
                <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--mid)", lineHeight: 1.7 }}>
                  La 2FA ajoute une couche de sécurité : en plus de votre mot de passe,
                  un code temporaire (Google Authenticator, Authy…) sera requis à chaque connexion.
                </p>
                <button onClick={handleSetup} disabled={working || loading}
                  style={{
                    background: "var(--gold)", color: "#fff", border: "none",
                    padding: "11px 22px", borderRadius: 9, fontWeight: 700,
                    fontSize: 13, cursor: (working || loading) ? "not-allowed" : "pointer",
                    opacity: (working || loading) ? .6 : 1, fontFamily: "'Sora',sans-serif",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <KeyRound size={14} />
                  {working ? "Génération…" : "Activer la 2FA"}
                </button>
              </div>
            )}

            {/* Étape 1 — afficher QR + secret */}
            {phase === "setup" && (
              <div>
                <div style={{
                  background: "rgba(75,123,255,.08)", border: "1px solid rgba(75,123,255,.2)",
                  borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--mid)",
                }}>
                  <strong style={{ color: "var(--text)" }}>Étape 1 :</strong> Scannez le QR code
                  avec votre application d&apos;authentification (Google Authenticator, Authy, etc.)
                </div>

                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20 }}>
                  {qrImageUrl && (
                    <div style={{
                      border: "4px solid var(--card)", borderRadius: 10, overflow: "hidden",
                      boxShadow: "0 4px 16px rgba(0,0,0,.12)", flexShrink: 0,
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImageUrl} alt="QR Code 2FA" width={180} height={180} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                      Ou saisissez manuellement
                    </div>
                    <div style={{
                      background: "var(--elevated)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "10px 12px",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <code style={{ flex: 1, fontSize: 13, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
                        {secret}
                      </code>
                      <button type="button" onClick={copySecret}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: copied ? "var(--green)" : "var(--sub)", flexShrink: 0 }}>
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 8 }}>
                      <Smartphone size={11} style={{ display: "inline", marginRight: 4 }} />
                      Nom du compte : MynaPay BF
                    </div>
                  </div>
                </div>

                <button onClick={() => setPhase("confirm")}
                  style={{
                    width: "100%", background: "var(--blue)", color: "#fff",
                    border: "none", padding: "11px", borderRadius: 9,
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                    fontFamily: "'Sora',sans-serif",
                  }}>
                  J&apos;ai scanné le code → Continuer
                </button>
              </div>
            )}

            {/* Étape 2 — confirmer le code */}
            {phase === "confirm" && (
              <div>
                <div style={{
                  background: "rgba(75,123,255,.08)", border: "1px solid rgba(75,123,255,.2)",
                  borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--mid)",
                }}>
                  <strong style={{ color: "var(--text)" }}>Étape 2 :</strong> Entrez le code à 6 chiffres
                  affiché dans votre application pour confirmer la configuration.
                </div>

                <form onSubmit={handleConfirm}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    style={{
                      width: "100%", background: "var(--elevated)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "14px 16px", color: "var(--text)", fontSize: 24,
                      fontWeight: 800, letterSpacing: "0.4em", textAlign: "center",
                      outline: "none", boxSizing: "border-box", marginBottom: 14, fontFamily: "monospace",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={() => setPhase("setup")}
                      style={{
                        flex: 1, background: "var(--elevated)", border: "1px solid var(--border)",
                        color: "var(--mid)", padding: "11px", borderRadius: 9,
                        fontWeight: 600, fontSize: 13, cursor: "pointer",
                      }}>
                      ← Retour
                    </button>
                    <button type="submit" disabled={code.length !== 6 || working}
                      style={{
                        flex: 2, background: "var(--green)", color: "#fff",
                        border: "none", padding: "11px", borderRadius: 9,
                        fontWeight: 700, fontSize: 13,
                        cursor: (code.length !== 6 || working) ? "not-allowed" : "pointer",
                        opacity: (code.length !== 6 || working) ? .6 : 1,
                        fontFamily: "'Sora',sans-serif",
                      }}>
                      {working ? "Vérification…" : "Confirmer et activer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 2FA active — désactiver */}
            {totpEnabled && (phase === "idle" || phase === "done") && (
              <div>
                <div style={{
                  background: "var(--green-sub)", border: "1px solid rgba(13,201,138,.2)",
                  borderRadius: 8, padding: "12px 16px", marginBottom: 20,
                  display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                }}>
                  <CheckCircle2 size={16} color="var(--green)" />
                  <span style={{ color: "var(--mid)" }}>
                    Un code TOTP sera demandé lors de toute action financière sensible.
                  </span>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--mid)", fontWeight: 700, marginBottom: 6 }}>
                    CODE DE CONFIRMATION
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={disableCode}
                    onChange={e => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    style={{
                      width: "100%", background: "var(--elevated)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 16,
                      fontWeight: 800, letterSpacing: "0.35em", textAlign: "center",
                      outline: "none", boxSizing: "border-box", fontFamily: "monospace",
                    }}
                  />
                </div>
                <button onClick={handleDisable} disabled={working}
                  style={{
                    background: "var(--red-sub)", color: "var(--red)",
                    border: "1px solid var(--red-border)", padding: "10px 20px",
                    borderRadius: 9, fontWeight: 700, fontSize: 13,
                    cursor: working ? "not-allowed" : "pointer", opacity: working ? .6 : 1,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <ShieldOff size={14} />
                  {working ? "Désactivation…" : "Désactiver la 2FA"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
