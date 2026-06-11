"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Clock, FileText, Shield, Upload, XCircle,
  AlertTriangle, RefreshCw, LogOut, ChevronRight,
} from "lucide-react";
import { api, auth } from "@/lib/api";
import type { KYBDocument, TenantKYBStatus, TenantStatus } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────

const DOC_TYPES: { value: string; label: string; description: string; required: boolean }[] = [
  { value: "rccm",           label: "RCCM",                description: "Registre du Commerce et du Crédit Mobilier", required: true },
  { value: "ifu",            label: "IFU",                 description: "Identifiant Fiscal Unique",                  required: true },
  { value: "id_card",        label: "Pièce d'identité",    description: "CNI ou passeport du dirigeant",              required: true },
  { value: "tax_stamp",      label: "Quitus fiscal",       description: "Attestation de situation fiscale",           required: false },
  { value: "bank_statement", label: "Relevé bancaire",     description: "Relevé des 3 derniers mois",                 required: false },
  { value: "other",          label: "Autre document",      description: "Tout autre document complémentaire",         required: false },
];

const ACCEPTED = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "En attente",  color: "var(--gold)",   bg: "var(--gold-sub)"   },
  approved: { label: "Approuvé",    color: "var(--green)",  bg: "var(--green-sub)"  },
  rejected: { label: "Rejeté",      color: "var(--red)",    bg: "var(--red-sub)"    },
};

const TENANT_STATUS_UI: Record<TenantStatus, { label: string; color: string; icon: React.ElementType; message: string }> = {
  prospect:    { label: "Prospect",      color: "var(--sub)",   icon: Clock,         message: "Déposez vos documents pour démarrer votre vérification KYB." },
  kyb_pending: { label: "En révision",   color: "var(--gold)",  icon: Clock,         message: "Votre dossier est en cours d'examen par notre équipe. Vous serez notifié par email dès validation." },
  active:      { label: "Actif",         color: "var(--green)", icon: CheckCircle2,  message: "Votre compte est actif. Vous pouvez accéder à votre espace." },
  suspended:   { label: "Suspendu",      color: "var(--red)",   icon: AlertTriangle, message: "Votre compte est suspendu. Contactez le support." },
};

// ── Component ─────────────────────────────────────────────────────

export default function KYBOnboardingPage() {
  const router = useRouter();
  const [kyb, setKyb]           = useState<TenantKYBStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const fileInputRef             = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string>("");

  const tenantName = typeof window !== "undefined"
    ? localStorage.getItem("masspay_tenant_name") ?? "votre entreprise"
    : "votre entreprise";

  const load = useCallback(async () => {
    try {
      const data = await api.tenant.kybStatus();
      setKyb(data);
      // Mettre à jour le statut en localStorage pour le KYB gate
      localStorage.setItem("masspay_tenant_status", data.status);
      // Si activé → rediriger vers le dashboard
      if (data.status === "active") {
        router.replace("/dashboard");
      }
    } catch {
      setError("Impossible de charger le statut KYB.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Polling toutes les 30s pour détecter une activation en cours de session
  useEffect(() => {
    const id = setInterval(() => {
      if (kyb?.status === "kyb_pending") load();
    }, 30_000);
    return () => clearInterval(id);
  }, [kyb?.status, load]);

  const handleLogout = () => {
    auth.clear();
    localStorage.clear();
    router.replace("/login");
  };

  const docsForType = (type: string): KYBDocument[] =>
    (kyb?.docs ?? []).filter(d => d.type === type);

  const latestForType = (type: string): KYBDocument | undefined =>
    docsForType(type).at(0);

  const openFilePicker = (type: string) => {
    setPendingType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingType) return;

    if (file.size > MAX_SIZE_BYTES) {
      setError(`Fichier trop volumineux (max 5 Mo) : ${file.name}`);
      return;
    }

    setUploading(pendingType);
    setError("");
    setSuccess("");
    try {
      const b64 = await fileToBase64(file);
      await api.tenant.uploadKYBDoc({
        type: pendingType,
        file_name: file.name,
        mime_type: file.type,
        file_data: b64,
      });
      setSuccess(`Document "${DOC_TYPES.find(t => t.value === pendingType)?.label}" soumis avec succès.`);
      await load();
    } catch (err: unknown) {
      setError((err as Error).message || "Erreur lors de l'envoi.");
    } finally {
      setUploading(null);
      setPendingType("");
    }
  };

  if (loading) return <PageLoader />;

  const statusUi = TENANT_STATUS_UI[kyb?.status ?? "prospect"];
  const StatusIcon = statusUi.icon;

  const requiredDone = DOC_TYPES
    .filter(t => t.required)
    .every(t => {
      const doc = latestForType(t.value);
      return doc && doc.status !== "rejected";
    });
  const canUpload = kyb?.status === "prospect" || kyb?.status === "kyb_pending";

  const totalDocs   = kyb?.docs.length ?? 0;
  const approvedDocs = kyb?.docs.filter(d => d.status === "approved").length ?? 0;

  return (
    <div style={{ width: "100%", maxWidth: 720 }}>

      {/* Déconnexion */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={handleLogout} style={{
          background: "transparent", border: "1px solid var(--border)",
          color: "var(--sub)", borderRadius: 8, padding: "6px 14px",
          fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}>
          <LogOut size={13} /> Déconnexion
        </button>
      </div>

      {/* En-tête statut */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "22px 24px", marginBottom: 20,
        borderLeft: `4px solid ${statusUi.color}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `color-mix(in srgb, ${statusUi.color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${statusUi.color} 25%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <StatusIcon size={18} color={statusUi.color} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>
              Statut du dossier
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: statusUi.color, fontFamily: "'Sora',sans-serif" }}>
              {statusUi.label}
            </div>
          </div>
          {kyb?.status === "kyb_pending" && (
            <button onClick={() => load()} title="Rafraîchir"
              style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--sub)", padding: 4 }}>
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--mid)", lineHeight: 1.6 }}>
          {statusUi.message}
        </p>
        {totalDocs > 0 && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              flex: 1, height: 6, borderRadius: 999,
              background: "var(--elevated)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 999,
                background: "var(--green)",
                width: `${Math.round((approvedDocs / Math.max(totalDocs, 1)) * 100)}%`,
                transition: "width .4s ease",
              }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>
              {approvedDocs}/{totalDocs} approuvé{approvedDocs !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Alertes globales */}
      {error && (
        <div style={{
          background: "var(--red-sub)", border: "1px solid var(--red-border)",
          color: "var(--red)", borderRadius: 8, padding: "10px 16px",
          fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", gap: 8, alignItems: "center",
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {success && (
        <div style={{
          background: "var(--green-sub)", border: "1px solid rgba(13,201,138,.25)",
          color: "var(--green)", borderRadius: 8, padding: "10px 16px",
          fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", gap: 8, alignItems: "center",
        }}>
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      {/* Commentaires admin */}
      {(kyb?.comments ?? []).length > 0 && (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "18px 22px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>
            Messages de l&apos;équipe MynaPay
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {kyb!.comments.map(c => (
              <div key={c.id} style={{
                background: "var(--elevated)", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, color: "var(--mid)", lineHeight: 1.6,
              }}>
                <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>
                  {new Date(c.created_at).toLocaleDateString("fr-FR", { dateStyle: "medium" })}
                </div>
                {c.comment}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 10, overflow: "hidden", marginBottom: 20,
      }}>
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif" }}>
              Documents requis · {tenantName}
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3 }}>
              Les documents marqués * sont obligatoires
            </div>
          </div>
        </div>

        <div>
          {DOC_TYPES.map((dt, idx) => {
            const doc     = latestForType(dt.value);
            const busy    = uploading === dt.value;
            const badge   = doc ? STATUS_BADGE[doc.status] : null;
            const rejected = doc?.status === "rejected";

            return (
              <div key={dt.value} style={{
                padding: "16px 22px",
                borderBottom: idx < DOC_TYPES.length - 1 ? "1px solid var(--border-soft)" : "none",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                {/* Icône */}
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: doc?.status === "approved" ? "var(--green-sub)" : "var(--elevated)",
                  border: `1px solid ${doc?.status === "approved" ? "rgba(13,201,138,.25)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {doc?.status === "approved"
                    ? <CheckCircle2 size={17} color="var(--green)" />
                    : doc?.status === "rejected"
                      ? <XCircle size={17} color="var(--red)" />
                      : <FileText size={17} color="var(--sub)" />}
                </div>

                {/* Infos */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                      {dt.label}{dt.required ? " *" : ""}
                    </span>
                    {badge && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 8, background: badge.bg, color: badge.color,
                        textTransform: "uppercase",
                      }}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)" }}>{dt.description}</div>
                  {doc && (
                    <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 3 }}>
                      {doc.original_name} · {(doc.file_size / 1024).toFixed(0)} Ko
                    </div>
                  )}
                  {rejected && doc?.review_note && (
                    <div style={{
                      fontSize: 11, color: "var(--red)", marginTop: 4,
                      background: "var(--red-sub)", borderRadius: 6,
                      padding: "4px 8px", display: "inline-block",
                    }}>
                      Motif : {doc.review_note}
                    </div>
                  )}
                </div>

                {/* Action */}
                {canUpload && doc?.status !== "approved" && (
                  <button
                    onClick={() => openFilePicker(dt.value)}
                    disabled={busy}
                    style={{
                      background: rejected ? "var(--red-sub)" : "var(--elevated)",
                      border: `1px solid ${rejected ? "var(--red-border)" : "var(--border)"}`,
                      color: rejected ? "var(--red)" : "var(--mid)",
                      borderRadius: 8, padding: "7px 14px", fontSize: 12,
                      fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? .6 : 1,
                      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    }}
                  >
                    {busy
                      ? <><Spinner /> Envoi…</>
                      : doc
                        ? <><RefreshCw size={12} /> Remplacer</>
                        : <><Upload size={12} /> {rejected ? "Re-soumettre" : "Joindre"}</>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA soumission */}
      {(kyb?.status === "prospect" || kyb?.status === "kyb_pending") && (
        <div style={{
          background: requiredDone ? "var(--green-sub)" : "var(--card)",
          border: `1px solid ${requiredDone ? "rgba(13,201,138,.25)" : "var(--border)"}`,
          borderRadius: 10, padding: "18px 22px",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            {requiredDone ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--green)", marginBottom: 4 }}>
                  Dossier complet
                </div>
                <div style={{ fontSize: 12, color: "var(--mid)" }}>
                  Tous les documents obligatoires ont été soumis. Notre équipe va examiner votre dossier.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
                  Documents manquants
                </div>
                <div style={{ fontSize: 12, color: "var(--sub)" }}>
                  Soumettez les documents obligatoires (*) pour compléter votre dossier KYB.
                </div>
              </>
            )}
          </div>
          {requiredDone && <ChevronRight size={18} color="var(--green)" />}
        </div>
      )}

      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Spinner() {
  return (
    <div style={{
      width: 12, height: 12, border: "2px solid currentColor",
      borderTopColor: "transparent", borderRadius: "50%",
      animation: "spin .7s linear infinite", display: "inline-block",
    }} />
  );
}

function PageLoader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
      <div style={{
        width: 28, height: 28, border: "3px solid var(--gold)",
        borderTopColor: "transparent", borderRadius: "50%",
        animation: "spin .8s linear infinite",
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
