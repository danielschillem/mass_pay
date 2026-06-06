"use client";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { WalletTransaction, Wallet } from "@/lib/types";
import { fcfa } from "@/lib/types";

const TX_LABELS: Record<string, { label: string; color: string; sign: string }> = {
  recharge:    { label:"Recharge",         color:"var(--green)", sign:"+" },
  batch_debit: { label:"Provision batch",  color:"var(--red)", sign:"−" },
  refund:      { label:"Remboursement",    color:"var(--blue)", sign:"+" },
  commission:  { label:"Commission",       color:"var(--gold)", sign:"−" },
};

export default function WalletPage() {
  const [wallet, setWallet]   = useState<Wallet | null>(null);
  const [txs, setTxs]         = useState<WalletTransaction[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const loadTxs = (p: number) => {
    setLoading(true);
    Promise.all([
      api.tenant.wallet(),
      api.tenant.walletTransactions(p, 20),
    ]).then(([w, t]) => {
      setWallet(w);
      setTxs(t.data);
      setTotal(t.total);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadTxs(1); }, []);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0, fontFamily:"'Sora',sans-serif" }}>
            Wallet
          </h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"4px 0 0" }}>Solde et historique des mouvements</p>
        </div>
        <button type="button" onClick={() => loadTxs(page)}
          style={{ background:"var(--elevated)", border:"1px solid var(--border)", color:"var(--mid)",
            padding:"9px 14px", borderRadius:9, cursor:"pointer", display:"flex",
            alignItems:"center", gap:6, fontSize:13, fontWeight:600 }}>
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Soldes */}
      {wallet && (
        <div style={{ display:"flex", gap:14, marginBottom:24, flexWrap:"wrap" }}>
          {[
            { label:"Disponible",   val:wallet.available_balance, color:"var(--green)" },
            { label:"Réservé",      val:wallet.reserved_balance,  color:"var(--gold)" },
            { label:"Total débité", val:wallet.total_debited,     color:"var(--blue)" },
            { label:"Commissions",  val:wallet.total_commission,  color:"var(--violet)" },
            { label:"Remboursé",    val:wallet.total_refunded,    color:"var(--mid)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, padding:"18px 22px", flex:1, minWidth:140 }}>
              <div style={{ color:"var(--sub)", fontSize:10, fontWeight:700,
                textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>{label}</div>
              <div style={{ color, fontSize:20, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
                {fcfa(val)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historique */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontWeight:700, fontSize:14, fontFamily:"'Sora',sans-serif" }}>
            Mouvements · {total} au total
          </span>
        </div>
        {loading ? <Spinner /> : txs.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--sub)", fontSize:13 }}>
            Aucun mouvement enregistré
          </div>
        ) : (
          <>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--surf)" }}>
                  {["Date","Type","Référence","Avant","Montant","Après","Note"].map(h => (
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", color:"var(--sub)",
                      fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => {
                  const meta = TX_LABELS[tx.type] ?? { label:tx.type, color:"var(--mid)", sign:"" };
                  const isCredit = tx.amount > 0;
                  return (
                    <tr key={tx.id}
                      style={{ borderBottom: i < txs.length-1 ? "1px solid var(--border-soft)" : "none" }}>
                      <td style={{ padding:"12px 16px", color:"var(--mid)", fontSize:11 }}>
                        {new Date(tx.created_at).toLocaleString("fr-FR", { dateStyle:"short", timeStyle:"short" })}
                      </td>
                      <td style={{ padding:"12px 16px" }}>
                        <span style={{ background:`color-mix(in srgb, ${meta.color} 12%, transparent)`, color:meta.color,
                          fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:8,
                          textTransform:"uppercase" }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding:"12px 16px", fontSize:11, fontFamily:"monospace" }}>
                        {tx.reference
                          ? <span style={{ color:"var(--text)", fontWeight:600 }}>{tx.reference}</span>
                          : <span style={{ color:"var(--sub)" }}>#{tx.id.slice(0, 8)}</span>}
                      </td>
                      <td style={{ padding:"12px 16px", color:"var(--sub)", fontSize:12 }}>
                        {fcfa(tx.balance_before)}
                      </td>
                      <td style={{ padding:"12px 16px" }}>
                        <span style={{ color: isCredit ? "var(--green)" : "var(--red)",
                          fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:4 }}>
                          {isCredit
                            ? <ArrowDownLeft size={12} />
                            : <ArrowUpRight size={12} />}
                          {meta.sign}{fcfa(Math.abs(tx.amount))}
                        </span>
                      </td>
                      <td style={{ padding:"12px 16px", color:"var(--text)", fontSize:12, fontWeight:600 }}>
                        {fcfa(tx.balance_after)}
                      </td>
                      <td style={{ padding:"12px 16px", color:"var(--sub)", fontSize:11 }}>
                        {tx.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding:"14px 20px", borderTop:"1px solid var(--border)",
                display:"flex", gap:8, justifyContent:"center" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} type="button" onClick={() => { setPage(p); loadTxs(p); }}
                    style={{ background: p === page ? "var(--gold)" : "var(--elevated)",
                      color: p === page ? "#fff" : "var(--mid)",
                      border:`1px solid ${p === page ? "var(--gold)" : "var(--border)"}`,
                      borderRadius:7, padding:"5px 12px", fontSize:12, fontWeight:600,
                      cursor:"pointer" }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
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
