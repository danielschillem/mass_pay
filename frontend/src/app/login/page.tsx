"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Layers } from "lucide-react";
import { api, auth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.login({ email, password });
      auth.setToken(res.access_token);
      auth.setRefreshToken(res.refresh_token);
      localStorage.setItem("masspay_role", res.user.role);
      localStorage.setItem("masspay_user", JSON.stringify(res.user));
      localStorage.setItem("masspay_tenant_name", res.user.tenant_name ?? "");
      router.push(res.user.role === "super_admin" ? "/admin" : "/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || !email || !password;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif",
      background:"linear-gradient(180deg,#F8FAFC 0%, var(--app-bg) 100%)" }}>
      <div style={{ width:"100%", maxWidth:980, display:"grid",
        gridTemplateColumns:"minmax(320px, 420px) minmax(320px, 1fr)",
        gap:28, alignItems:"stretch" }}>
        <section style={{ background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:8, padding:32, boxShadow:"var(--shadow)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:36 }}>
            <div style={{ width:42, height:42, background:"var(--gold)", borderRadius:8,
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 12px 26px rgba(183,121,31,.20)" }}>
              <Layers size={21} color="#fff" />
            </div>
            <span style={{ fontFamily:"'Sora',sans-serif", fontWeight:800,
              fontSize:22, color:"var(--text)" }}>
              MynaPay <span style={{ color:"var(--gold)" }}>BF</span>
            </span>
          </div>

          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:22,
            fontWeight:800, color:"var(--text)", margin:"0 0 6px" }}>
            Connexion
          </h1>
          <p style={{ color:"var(--sub)", fontSize:13, margin:"0 0 24px" }}>
            Plateforme de virement en masse
          </p>

          {error && (
            <div style={{ background:"var(--red-sub)", border:"1px solid var(--red-border)",
              borderRadius:8, padding:"11px 14px", marginBottom:16,
              color:"var(--red)", fontSize:13, fontWeight:600 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ color:"var(--mid)", fontSize:11, fontWeight:800,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:7 }}>
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="admin@entreprise.bf"
              style={{ width:"100%", background:"var(--elevated)",
                border:"1px solid var(--border)", borderRadius:8,
                padding:"12px 14px", color:"var(--text)", fontSize:14,
                outline:"none", boxSizing:"border-box" }}
            />
          </div>

          <div style={{ marginBottom:24, position:"relative" }}>
            <label style={{ color:"var(--mid)", fontSize:11, fontWeight:800,
              textTransform:"uppercase", letterSpacing:".5px", display:"block", marginBottom:7 }}>
              Mot de passe
            </label>
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="********"
              style={{ width:"100%", background:"var(--elevated)",
                border:"1px solid var(--border)", borderRadius:8,
                padding:"12px 42px 12px 14px", color:"var(--text)", fontSize:14,
                outline:"none", boxSizing:"border-box" }}
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              style={{ position:"absolute", right:12, top:35, background:"transparent",
                border:"none", cursor:"pointer", padding:0, color:"var(--sub)" }}>
              {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <button type="button" onClick={handleLogin} disabled={disabled}
            style={{ width:"100%", background: disabled ? "var(--elevated)" : "var(--gold)",
              color: disabled ? "var(--sub)" : "#fff", border:"none",
              padding:"13px", borderRadius:8, fontWeight:800, fontSize:15,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily:"'Sora',sans-serif",
              boxShadow: disabled ? "none" : "0 12px 28px rgba(183,121,31,.20)" }}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </section>

        <section style={{ border:"1px solid var(--border)", borderRadius:8,
          background:"var(--surf)",
          boxShadow:"var(--shadow)", padding:32, display:"flex",
          flexDirection:"column", justifyContent:"space-between", minHeight:420 }}>
          <div>
            <div style={{ color:"var(--gold)", fontSize:12, fontWeight:800,
              textTransform:"uppercase", letterSpacing:".6px", marginBottom:14 }}>
              Console de paiement
            </div>
            <h2 style={{ color:"var(--text)", fontFamily:"'Sora',sans-serif",
              fontSize:32, lineHeight:1.12, margin:"0 0 14px", maxWidth:430 }}>
              Pilotez vos virements de masse avec une interface claire.
            </h2>
            <p style={{ color:"var(--mid)", fontSize:15, lineHeight:1.7,
              margin:0, maxWidth:470 }}>
              Suivi KYB, provisions wallet, batchs, bénéficiaires et validations sont regroupés dans un espace pensé pour l'exécution quotidienne.
            </p>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)",
            gap:12, marginTop:28 }}>
            {["KYB", "Wallet", "Batchs"].map(label => (
              <div key={label} style={{ background:"var(--card)",
                border:"1px solid var(--border)", borderRadius:8,
                padding:"14px 12px", boxShadow:"var(--shadow-sm)" }}>
                <div style={{ color:"var(--sub)", fontSize:11, fontWeight:800,
                  textTransform:"uppercase", letterSpacing:".5px" }}>
                  {label}
                </div>
                <div style={{ color:"var(--text)", fontSize:13,
                  fontWeight:800, marginTop:6 }}>
                  Opérationnel
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
