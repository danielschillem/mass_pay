"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, XCircle, Upload, MessageSquare,
  Clock, FileText, Shield, AlertTriangle, Check, X, RefreshCw
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  TenantDetail, KYBDocument, KYBComment, KYBHistory, TenantStatus,
} from "@/lib/types";

const DOC_TYPE_LABELS: Record<string, string> = {
  rccm: "RCCM", ifu: "IFU", id_card: "Pièce d'identité",
  tax_stamp: "Quitus fiscal", bank_statement: "Relevé bancaire", other: "Autre",
};
const DOC_TYPE_ICONS: Record<string, React.ElementType> = {
  rccm: FileText, ifu: FileText, id_card: Shield,
  tax_stamp: FileText, bank_statement: FileText, other: FileText,
};

const STATUS_STYLE: Record<TenantStatus, { label: string; color: string }> = {
  prospect:    { label: "Prospect",     color: "var(--sub)" },
  kyb_pending: { label: "KYB en cours", color: "var(--gold)" },
  active:      { label: "Actif",        color: "var(--green)" },
  suspended:   { label: "Suspendu",     color: "var(--red)" },
};

const ACTION_LABELS: Record<string, string> = {
  document_uploaded: "Document téléversé",
  document_approved: "Document approuvé",
  document_rejected: "Document rejeté",
  kyb_rejected: "KYB rejeté",
  tenant_activated: "Tenant activé",
  tenant_suspended: "Tenant suspendu",
};

export default function KYBDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData]       = useState<TenantDetail | null>(null);
  const [docs, setDocs]       = useState<KYBDocument[]>([]);
  const [comments, setComments] = useState<KYBComment[]>([]);
  const [history, setHistory] = useState<KYBHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"documents" | "comments" | "history">("documents");
  const [newComment, setNewComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  const load = async () => {
    setLoading(true);
    try {
      const [d, docsRes, commentsRes, historyRes] = await Promise.all([
        api.admin.getTenant(id),
        api.admin.kybDocuments(id),
        api.admin.kybComments(id),
        api.admin.kybHistory(id),
      ]);
      setData(d);
      setDocs(docsRes.data);
      setComments(commentsRes.data);
      setHistory(historyRes.data);
    } catch (e: unknown) { flash((e as Error).message, false); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleActivate = async () => {
    if (!data) return;
    try {
      await api.admin.activate(data.tenant.id);
      setData(d => d ? { ...d, tenant: { ...d.tenant, status: "active" } } : d);
      await api.admin.addKYBComment(id, "KYB validé — Tenant activé");
      flash("Tenant activé avec succès");
      load();
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  const handleReject = async () => {
    if (!data || !rejectReason.trim()) return;
    try {
      await api.admin.rejectKYB(id, rejectReason.trim());
      flash("KYB rejeté");
      setShowReject(false);
      setRejectReason("");
      load();
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.admin.addKYBComment(id, newComment.trim());
      setNewComment("");
      const res = await api.admin.kybComments(id);
      setComments(res.data);
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  const handleReviewDoc = async (docId: string, status: string, note?: string) => {
    try {
      await api.admin.reviewKYBDocument(id, docId, status, note);
      flash(`Document ${status === "approved" ? "approuvé" : "rejeté"}`);
      const res = await api.admin.kybDocuments(id);
      setDocs(res.data);
      load();
    } catch (e: unknown) { flash((e as Error).message, false); }
  };

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color:"var(--red)", padding:40, textAlign:"center" }}>Tenant introuvable</div>;

  const { tenant } = data;
  const st = STATUS_STYLE[tenant.status] ?? STATUS_STYLE.prospect;
  const allDocsApproved = docs.length > 0 && docs.every(d => d.status === "approved");

  return (
    <div>
      {msg && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000,
          background: msg.ok ? "var(--green)" : "var(--red)", color:"#fff",
          padding:"12px 20px", borderRadius:8, fontWeight:700, fontSize:13 }}>
          {msg.text}
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:26 }}>
        <button type="button" onClick={() => router.back()} aria-label="Retour"
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8,
            padding:"7px 10px", cursor:"pointer", color:"var(--mid)" }}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            KYB · {tenant.raison_sociale}
          </h1>
          <p style={{ margin:"3px 0 0", color:"var(--sub)", fontSize:12 }}>
            IFU {tenant.ifu} · RCCM {tenant.rccm} · {tenant.secteur}
          </p>
        </div>
        <div style={{ flex:1 }} />
        <span style={{ background:`color-mix(in srgb, ${st.color} 12%, transparent)`, color:st.color,
          padding:"5px 14px", borderRadius:8, fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
          {st.label}
        </span>
        {tenant.status === "kyb_pending" && (
          <>
            <button type="button" onClick={handleActivate} disabled={!allDocsApproved}
              style={{ background: allDocsApproved ? "var(--green)" : "var(--elevated)",
                color: allDocsApproved ? "#fff" : "var(--sub)",
                border: allDocsApproved ? "none" : "1px solid var(--border)",
                padding:"9px 18px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                display:"flex", alignItems:"center", gap:6, opacity: allDocsApproved ? 1 : .6 }}>
              <CheckCircle2 size={15} /> Valider et activer
            </button>
            <button type="button" onClick={() => setShowReject(true)}
              style={{ background:"var(--red-sub)", color:"var(--red)",
                border:"1px solid var(--red-border)", padding:"9px 18px",
                borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                display:"flex", alignItems:"center", gap:6 }}>
              <XCircle size={15} /> Rejeter
            </button>
          </>
        )}
      </div>

      {!allDocsApproved && tenant.status === "kyb_pending" && docs.length > 0 && (
        <div style={{ background:"var(--gold-sub)", border:"1px solid var(--gold-border)",
          borderRadius:8, padding:"10px 16px", marginBottom:18, fontSize:13, color:"var(--gold)",
          display:"flex", alignItems:"center", gap:8 }}>
          <AlertTriangle size={14} />
          Tous les documents doivent être approuvés avant d&apos;activer le tenant
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, marginBottom:20, borderBottom:"2px solid var(--border)" }}>
        {[
          { key: "documents" as const, label: "Documents", icon: FileText },
          { key: "comments" as const, label: "Commentaires", icon: MessageSquare },
          { key: "history" as const, label: "Historique", icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            style={{ flex:1, background:"none", border:"none", padding:"12px 16px",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              gap:7, fontSize:13, fontWeight: activeTab === key ? 700 : 500,
              color: activeTab === key ? "var(--gold)" : "var(--mid)",
              borderBottom: activeTab === key ? "2px solid var(--gold)" : "2px solid transparent",
              marginBottom:-2, transition:"all .15s" }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeTab === "documents" && (
        <DocumentsTab
          docs={docs} tenantId={id}
          onReview={handleReviewDoc}
          onRefresh={() => api.admin.kybDocuments(id).then(r => setDocs(r.data))}
        />
      )}
      {activeTab === "comments" && (
        <CommentsTab
          comments={comments}
          newComment={newComment}
          onCommentChange={setNewComment}
          onAdd={handleAddComment}
        />
      )}
      {activeTab === "history" && <HistoryTab history={history} />}

      {/* Reject modal */}
      {showReject && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
          display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowReject(false); }}>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
            padding:28, width:440 }}>
            <h3 style={{ margin:"0 0 8px", fontSize:15, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
              Rejeter le dossier KYB
            </h3>
            <p style={{ color:"var(--sub)", fontSize:12, marginBottom:16 }}>
              Le tenant sera repassé en statut prospect. Il devra soumettre un nouveau dossier.
            </p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Motif du rejet..."
              style={{ width:"100%", minHeight:80, background:"var(--elevated)",
                border:"1px solid var(--border)", borderRadius:8, padding:10,
                color:"var(--text)", fontSize:13, outline:"none", resize:"vertical",
                boxSizing:"border-box", fontFamily:"'DM Sans',sans-serif" }} />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <button type="button" onClick={() => setShowReject(false)}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"9px 18px", borderRadius:9,
                  cursor:"pointer", fontSize:13, fontWeight:600 }}>Annuler</button>
              <button type="button" onClick={handleReject} disabled={!rejectReason.trim()}
                style={{ background:"var(--red)", color:"#fff", border:"none",
                  padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                  cursor:"pointer", opacity: rejectReason.trim() ? 1 : .5 }}>Rejeter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents Tab ──────────────────────────────────────────────────

function DocumentsTab({ docs, tenantId, onReview, onRefresh }: {
  docs: KYBDocument[]; tenantId: string;
  onReview: (docId: string, status: string, note?: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    type: "rccm",
    file_name: "",
    mime_type: "",
    file_size: 0,
    file_data: "",
  });
  const [uploadError, setUploadError] = useState("");
  const [rejectDoc, setRejectDoc] = useState<KYBDocument | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const resetUpload = () => {
    setUploadForm({ type: "rccm", file_name: "", mime_type: "", file_size: 0, file_data: "" });
    setUploadError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setUploadError("");
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Le fichier ne doit pas dépasser 5 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const raw = String(e.target?.result ?? "");
      const base64 = raw.includes(",") ? raw.split(",").pop() ?? "" : raw;
      setUploadForm(f => ({
        ...f,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        file_data: base64,
      }));
    };
    reader.onerror = () => setUploadError("Lecture du fichier impossible.");
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file_name || !uploadForm.file_data) {
      setUploadError("Sélectionnez un fichier avant d'envoyer.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      await api.admin.uploadKYBDocument(tenantId, uploadForm);
      setShowUpload(false);
      resetUpload();
      onRefresh();
    } catch (err: unknown) { setUploadError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div>
      {rejectDoc && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
          display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) { setRejectDoc(null); setRejectNote(""); } }}>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8,
            padding:28, width:440 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div>
                <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
                  Rejeter le document
                </h3>
                <div style={{ color:"var(--sub)", fontSize:12 }}>
                  {DOC_TYPE_LABELS[rejectDoc.type] ?? rejectDoc.type} · {rejectDoc.original_name}
                </div>
              </div>
              <button type="button" onClick={() => { setRejectDoc(null); setRejectNote(""); }} aria-label="Fermer"
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
                <X size={18} />
              </button>
            </div>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Motif du rejet..."
              style={{ width:"100%", minHeight:90, background:"var(--elevated)",
                border:"1px solid var(--border)", borderRadius:8, padding:10,
                color:"var(--text)", fontSize:13, outline:"none", resize:"vertical",
                boxSizing:"border-box", fontFamily:"'DM Sans',sans-serif" }} />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <button type="button" onClick={() => { setRejectDoc(null); setRejectNote(""); }}
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  color:"var(--mid)", padding:"9px 18px", borderRadius:9,
                  cursor:"pointer", fontSize:13, fontWeight:600 }}>Annuler</button>
              <button type="button" onClick={async () => {
                await onReview(rejectDoc.id, "rejected", rejectNote.trim() || undefined);
                setRejectDoc(null);
                setRejectNote("");
              }}
                style={{ background:"var(--red)", color:"#fff", border:"none",
                  padding:"9px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                  cursor:"pointer" }}>Rejeter</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13, color:"var(--sub)" }}>
          {docs.filter(d => d.status === "approved").length}/{docs.length} documents approuvés
        </div>
        <button type="button" onClick={() => setShowUpload(!showUpload)}
          style={{ background:"var(--blue)", color:"#fff", border:"none",
            padding:"8px 14px", borderRadius:8, fontWeight:700, fontSize:12,
            cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
          <Upload size={13} /> Ajouter un document
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} style={{ background:"var(--surf)", border:"1px solid var(--border)",
          borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:12, marginBottom:12 }}>
            <div>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:4, fontWeight:600 }}>Type</label>
              <select value={uploadForm.type} onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}
                style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:13, outline:"none" }}>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, color:"var(--mid)", marginBottom:4, fontWeight:600 }}>Fichier</label>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display:"none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                style={{ width:"100%", background:"var(--card)", border:"1px dashed var(--border-hi)",
                  borderRadius:8, padding:"10px 12px", color:uploadForm.file_name ? "var(--text)" : "var(--sub)",
                  fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:8,
                  justifyContent:"space-between", textAlign:"left" }}>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {uploadForm.file_name || "Choisir ou déposer un PDF / image"}
                </span>
                <Upload size={14} />
              </button>
            </div>
          </div>

          {uploadForm.file_name && (
            <div style={{ background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, padding:"10px 12px", marginBottom:12,
              display:"flex", alignItems:"center", gap:10 }}>
              <FileText size={16} color="var(--blue)" />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {uploadForm.file_name}
                </div>
                <div style={{ color:"var(--sub)", fontSize:11, marginTop:2 }}>
                  {uploadForm.mime_type || "Type inconnu"} · {(uploadForm.file_size / 1024).toFixed(1)} Ko
                </div>
              </div>
              <button type="button" onClick={resetUpload} aria-label="Retirer le fichier"
                style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                  borderRadius:7, padding:"5px 8px", color:"var(--mid)", cursor:"pointer" }}>
                <X size={12} />
              </button>
            </div>
          )}

          {uploadError && (
            <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
              color:"var(--red)", borderRadius:8, padding:"9px 12px", marginBottom:12,
              fontSize:12, fontWeight:600 }}>
              {uploadError}
            </div>
          )}

          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button type="button" onClick={() => { setShowUpload(false); resetUpload(); }}
              style={{ background:"var(--elevated)", border:"1px solid var(--border)",
                color:"var(--mid)", padding:"8px 16px", borderRadius:8,
                cursor:"pointer", fontSize:12, fontWeight:600 }}>Annuler</button>
            <button type="submit" disabled={uploading || !uploadForm.file_data}
              style={{ background:uploadForm.file_data ? "var(--blue)" : "var(--elevated)",
                color:uploadForm.file_data ? "#fff" : "var(--sub)", border:"none",
                padding:"8px 16px", borderRadius:8, fontWeight:700, fontSize:12,
                cursor:uploadForm.file_data ? "pointer" : "not-allowed", opacity: uploading ? .7 : 1 }}>
              {uploading ? "Envoi…" : "Uploader"}
            </button>
          </div>
        </form>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {docs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"32px 0", color:"var(--sub)", fontSize:13 }}>
            Aucun document pour le moment
          </div>
        ) : docs.map(doc => {
          const Icon = DOC_TYPE_ICONS[doc.type] ?? FileText;
          const statusColor = doc.status === "approved" ? "var(--green)" :
            doc.status === "rejected" ? "var(--red)" : "var(--gold)";
          return (
            <div key={doc.id} style={{ background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, padding:16, display:"flex", alignItems:"flex-start", gap:12 }}>
              <div style={{ width:36, height:36, background:`color-mix(in srgb, ${statusColor} 12%, transparent)`,
                borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Icon size={16} color={statusColor} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:700, fontSize:13 }}>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</span>
                  <span style={{
                    background:`color-mix(in srgb, ${statusColor} 12%, transparent)`,
                    color:statusColor, fontSize:10, fontWeight:700, padding:"2px 10px",
                    borderRadius:8, textTransform:"uppercase" }}>
                    {doc.status === "approved" ? "Approuvé" : doc.status === "rejected" ? "Rejeté" : "En attente"}
                  </span>
                </div>
                <div style={{ fontSize:11, color:"var(--sub)" }}>
                  {doc.original_name} · {(doc.file_size / 1024).toFixed(0)} Ko
                </div>
                {doc.review_note && (
                  <div style={{ marginTop:6, fontSize:12, color:"var(--mid)", fontStyle:"italic",
                    background:"var(--surf)", borderRadius:6, padding:"6px 10px" }}>
                    Note : {doc.review_note}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                {doc.status === "pending" && (
                  <>
                    <button type="button" title="Approuver" onClick={() => onReview(doc.id, "approved")}
                      style={{ background:"var(--green-sub)", border:"1px solid var(--green-border)",
                        borderRadius:7, padding:"6px 10px", cursor:"pointer", color:"var(--green)",
                        display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700 }}>
                      <Check size={12} /> Approuver
                    </button>
                    <button type="button" title="Rejeter" onClick={() => setRejectDoc(doc)}
                      style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
                        borderRadius:7, padding:"6px 10px", cursor:"pointer", color:"var(--red)",
                        display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700 }}>
                      <X size={12} /> Rejeter
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Comments Tab ───────────────────────────────────────────────────

function CommentsTab({ comments, newComment, onCommentChange, onAdd }: {
  comments: KYBComment[]; newComment: string;
  onCommentChange: (v: string) => void; onAdd: () => void;
}) {
  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20 }}>
        <textarea value={newComment} onChange={e => onCommentChange(e.target.value)}
          placeholder="Ajouter un commentaire…"
          style={{ flex:1, minHeight:44, background:"var(--elevated)",
            border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px",
            color:"var(--text)", fontSize:13, outline:"none", resize:"none",
            fontFamily:"'DM Sans',sans-serif" }} />
        <button type="button" onClick={onAdd} disabled={!newComment.trim()}
          style={{ background:"var(--gold)", color:"#fff", border:"none",
            padding:"10px 18px", borderRadius:8, fontWeight:700, fontSize:13,
            cursor:"pointer", opacity: newComment.trim() ? 1 : .5,
            whiteSpace:"nowrap" }}>Envoyer</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {comments.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 0", color:"var(--sub)", fontSize:13 }}>
            Aucun commentaire
          </div>
        ) : comments.map(c => (
          <div key={c.id} style={{ background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:8, padding:14 }}>
            <div style={{ fontSize:13, color:"var(--text)", whiteSpace:"pre-wrap" }}>{c.comment}</div>
            <div style={{ fontSize:10, color:"var(--sub)", marginTop:6 }}>
              {new Date(c.created_at).toLocaleString("fr-FR")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────

function HistoryTab({ history }: { history: KYBHistory[] }) {
  if (history.length === 0) {
    return (
      <div style={{ textAlign:"center", padding:"32px 0", color:"var(--sub)", fontSize:13 }}>
        Aucun historique
      </div>
    );
  }

  return (
    <div style={{ position:"relative" }}>
      {history.map((h, i) => {
        const isLast = i === history.length - 1;
        const bg = h.action.includes("approved") || h.action.includes("activated") ? "var(--green-sub)" :
          h.action.includes("rejected") || h.action.includes("suspended") ? "var(--red-sub)" :
          "var(--surf)";
        const dotColor = h.action.includes("approved") || h.action.includes("activated") ? "var(--green)" :
          h.action.includes("rejected") || h.action.includes("suspended") ? "var(--red)" :
          "var(--gold)";
        return (
          <div key={h.id} style={{ display:"flex", gap:14, paddingBottom: isLast ? 0 : 20, position:"relative" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:20 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:dotColor, flexShrink:0,
                border:"2px solid var(--card)", zIndex:1 }} />
              {!isLast && <div style={{ width:2, flex:1, background:"var(--border)", marginTop:-2 }} />}
            </div>
            <div style={{ flex:1, background:bg, border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>
                {ACTION_LABELS[h.action] ?? h.action}
              </div>
              {h.comment && <div style={{ fontSize:12, color:"var(--mid)", marginBottom:4 }}>{h.comment}</div>}
              <div style={{ fontSize:10, color:"var(--sub)" }}>
                {new Date(h.created_at).toLocaleString("fr-FR")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"80px 0" }}>
      <div style={{ width:32, height:32, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
