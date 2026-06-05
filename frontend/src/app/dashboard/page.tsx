"use client";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { TrendingUp, Layers, Users, AlertTriangle, Plus, Send, UserPlus, Upload, Download, ChevronRight, X, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { Wallet, Batch, DashboardStats } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { fcfa, shortFcfa } from "@/lib/types";

type QuickAction = {
  icon: React.ElementType;
  label: string;
  href: Route;
  color: string;
};

function RechargeInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:999,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16,
        padding:28, width:420 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
            Recharge du wallet
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--sub)" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ background:"rgba(75,123,255,.1)", border:"1px solid rgba(75,123,255,.25)",
          borderRadius:10, padding:"14px 16px", display:"flex", gap:12, marginBottom:18 }}>
          <Info size={18} color="var(--blue)" style={{ flexShrink:0, marginTop:1 }} />
          <p style={{ margin:0, fontSize:13, color:"var(--mid)", lineHeight:1.6 }}>
            La recharge du wallet est effectuée par votre administrateur de plateforme
            après réception de votre virement bancaire.
          </p>
        </div>
        <div style={{ fontSize:13, color:"var(--mid)", lineHeight:1.7, marginBottom:20 }}>
          <div style={{ fontWeight:700, color:"var(--text)", marginBottom:8 }}>Procédure :</div>
          <ol style={{ margin:0, paddingLeft:18, display:"flex", flexDirection:"column", gap:6 }}>
            <li>Effectuez un virement bancaire vers le compte MynaPay BF</li>
            <li>Envoyez la preuve de virement à votre gestionnaire de compte</li>
            <li>La recharge est créditée sous 24h ouvrées</li>
          </ol>
        </div>
        <button type="button" onClick={onClose}
          style={{ width:"100%", background:"var(--gold)", color:"#fff", border:"none",
            padding:"11px", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
            fontFamily:"'Sora',sans-serif" }}>
          Compris
        </button>
      </div>
    </div>
  );
}

export default function TenantDashboard() {
  const router = useRouter();
  const [wallet, setWallet]         = useState<Wallet | null>(null);
  const [stats, setStats]           = useState<DashboardStats | null>(null);
  const [batches, setBatches]       = useState<Batch[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);

  useEffect(() => {
    api.tenant.dashboard()
      .then(d => {
        setWallet(d.wallet);
        setStats(d.stats);
        setBatches(d.recent_batches ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  return (
    <div>
      {showRecharge && <RechargeInfoModal onClose={() => setShowRecharge(false)} />}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0, fontFamily:"'Sora',sans-serif" }}>
          Tableau de bord
        </h1>
        <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>Vue d&apos;ensemble de votre compte</p>
      </div>

      {/* Wallet card */}
      <div style={{ background:"linear-gradient(135deg,#152040 0%,#0C1428 100%)",
        border:"1px solid var(--border-hi)", borderRadius:16, padding:"26px 28px",
        marginBottom:22, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-30, top:-30, width:150, height:150,
          borderRadius:"50%", background:"rgba(228,167,48,.1)", filter:"blur(40px)" }} />
        <div style={{ position:"absolute", left:0, top:0, bottom:0, width:4,
          background:"linear-gradient(180deg,var(--gold),rgba(228,167,48,0))",
          borderRadius:"16px 0 0 16px" }} />
        <div style={{ position:"relative" }}>
          <div style={{ color:"var(--sub)", fontSize:11, fontWeight:700,
            textTransform:"uppercase", letterSpacing:".6px", marginBottom:8 }}>
            Solde disponible
          </div>
          <div style={{ fontSize:36, fontWeight:800, color:"var(--text)",
            fontFamily:"'Sora',sans-serif", marginBottom:4, letterSpacing:"-1px" }}>
            {wallet ? fcfa(wallet.available_balance) : "—"}
          </div>
          <div style={{ color:"var(--sub)", fontSize:13, marginBottom:20 }}>
            Compte de provision · Wallet plateforme
          </div>
          <div style={{ display:"flex", gap:12 }}>
            <button type="button" onClick={() => setShowRecharge(true)}
              style={{ background:"var(--gold)", color:"#fff", border:"none",
                padding:"10px 20px", borderRadius:9, fontWeight:700, fontSize:13,
                cursor:"pointer", display:"flex", alignItems:"center", gap:7,
                fontFamily:"'Sora',sans-serif" }}>
              <Plus size={15} /> Recharger
            </button>
            <button onClick={() => router.push("/dashboard/batches/new")}
              style={{ background:"var(--blue-sub)", color:"var(--blue)",
                border:"1px solid var(--blue-border)", padding:"10px 20px",
                borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer",
                display:"flex", alignItems:"center", gap:7 }}>
              <Send size={14} /> Nouveau batch
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:14, marginBottom:22, flexWrap:"wrap" }}>
        <StatCard icon={TrendingUp}    label="Volume ce mois"    value={shortFcfa(stats?.monthly_volume_fcfa ?? 0)} color="var(--blue)" />
        <StatCard icon={Layers}        label="Batchs complétés"  value={stats?.total_batches ?? 0} />
        <StatCard icon={Users}         label="Bénéficiaires"     value={stats?.total_beneficiaries ?? 0} color="var(--green)" />
        <StatCard icon={AlertTriangle} label="Virements échoués" value={stats?.failed_items ?? 0}   color="var(--red)" />
      </div>

      <div style={{ display:"flex", gap:16 }}>
        {/* Derniers batchs */}
        <div style={{ flex:2, background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"15px 22px", borderBottom:"1px solid var(--border)",
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>Derniers batchs</span>
            <button onClick={() => router.push("/dashboard/batches")}
              style={{ background:"transparent", border:"1px solid var(--border-hi)",
                color:"var(--mid)", padding:"5px 12px", borderRadius:7, fontSize:12, cursor:"pointer" }}>
              Historique →
            </button>
          </div>
          {batches.length === 0 ? (
            <div style={{ padding:"32px 20px", textAlign:"center", color:"var(--sub)", fontSize:13 }}>
              Aucun batch exécuté · créez votre premier batch
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Libellé","Type","Bénéficiaires","Masse","Statut"].map(h => (
                    <th key={h} style={{ padding:"9px 20px", textAlign:"left", color:"var(--sub)",
                      fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.slice(0, 4).map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: i < 3 ? "1px solid var(--border-soft)" : "none",
                    cursor:"pointer" }} onClick={() => router.push(`/dashboard/batches`)}>
                    <td style={{ padding:"12px 20px", fontWeight:600, fontSize:13 }}>{b.label}</td>
                    <td style={{ padding:"12px 20px" }}><Badge type={b.type} /></td>
                    <td style={{ padding:"12px 20px", color:"var(--mid)", fontSize:13 }}>{b.item_count}</td>
                    <td style={{ padding:"12px 20px", color:"var(--text)", fontWeight:600, fontSize:13 }}>
                      {shortFcfa(b.total_amount)}
                    </td>
                    <td style={{ padding:"12px 20px" }}><Badge type={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions rapides */}
        <div style={{ flex:1, background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:14, padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16,
            fontFamily:"'Sora',sans-serif" }}>Actions rapides</div>
          {([
            { icon:Send,     label:"Nouveau batch de virement", href:"/dashboard/batches/new",   color:"var(--gold)" },
            { icon:UserPlus, label:"Ajouter un bénéficiaire",   href:"/dashboard/beneficiaries", color:"var(--blue)" },
            { icon:Upload,   label:"Importer liste CSV",        href:"/dashboard/beneficiaries", color:"var(--green)" },
            { icon:Download, label:"Rapport du mois",           href:"/dashboard/batches",       color:"var(--violet)" },
          ] satisfies QuickAction[]).map(a => (
            <button key={a.label} onClick={() => router.push(a.href)}
              style={{ width:"100%", background:"var(--elevated)", border:"1px solid var(--border)",
                borderRadius:10, padding:"11px 14px", display:"flex", alignItems:"center",
                gap:11, cursor:"pointer", marginBottom:8, textAlign:"left" }}>
              <div style={{ background:`color-mix(in srgb, ${a.color} 12%, transparent)`, borderRadius:8, padding:7 }}>
                <a.icon size={14} color={a.color} />
              </div>
              <span style={{ color:"var(--text)", fontSize:12, fontWeight:500 }}>{a.label}</span>
              <ChevronRight size={13} color="var(--sub)" style={{ marginLeft:"auto" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display:"flex", justifyContent:"center", paddingTop:80 }}>
      <div style={{ width:28, height:28, border:"3px solid var(--gold)",
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
