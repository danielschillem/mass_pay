"use client";
import { useEffect, useState } from "react";
import { Building2, Activity, TrendingUp, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { GlobalStats, Tenant, PaginatedResponse } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { shortFcfa } from "@/lib/types";

export default function AdminDashboard() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.admin.stats(),
      api.admin.tenants(1, 10),
    ]).then(([s, t]) => {
      setStats(s);
      setTenants((t as PaginatedResponse<Tenant>).data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0, fontFamily:"'Sora',sans-serif" }}>
          Vue globale
        </h1>
        <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>Plateforme MynaPay BF</p>
      </div>

      <div style={{ display:"flex", gap:14, marginBottom:24, flexWrap:"wrap" }}>
        <StatCard icon={Building2}     label="Tenants actifs"   value={stats?.active_tenants ?? 0}            sub={`sur ${stats?.total_tenants ?? 0} enregistrés`} />
        <StatCard icon={Activity}      label="Volume total"     value={shortFcfa(stats?.total_volume_fcfa ?? 0)}  sub="cumulé"          color="var(--blue)" />
        <StatCard icon={TrendingUp}    label="Commissions"      value={shortFcfa(stats?.total_commission_fcfa ?? 0)} sub="revenus plateforme" color="var(--green)" />
        <StatCard icon={AlertTriangle} label="Batchs complétés" value={stats?.total_batches ?? 0}             sub="tous temps"       color="var(--violet)" />
      </div>

      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden" }}>
        <div style={{ padding:"15px 22px", borderBottom:"1px solid var(--border)",
          fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>
          Tenants enregistrés
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
              {["Entreprise","Secteur","Volume","Commission","Statut"].map(h => (
                <th key={h} style={{ padding:"9px 20px", textAlign:"left", color:"var(--sub)",
                  fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tenants.length-1 ? "1px solid var(--border-soft)" : "none" }}>
                <td style={{ padding:"13px 20px" }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{t.raison_sociale}</div>
                </td>
                <td style={{ padding:"13px 20px", color:"var(--mid)", fontSize:12 }}>{t.secteur}</td>
                <td style={{ padding:"13px 20px", color:"var(--text)", fontSize:13, fontWeight:600 }}>
                  {t.wallet ? shortFcfa(t.wallet.total_debited) : "—"}
                </td>
                <td style={{ padding:"13px 20px", color:"var(--green)", fontSize:13, fontWeight:700 }}>
                  {t.wallet ? shortFcfa(t.wallet.total_commission) : "—"}
                </td>
                <td style={{ padding:"13px 20px" }}><Badge type={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
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
