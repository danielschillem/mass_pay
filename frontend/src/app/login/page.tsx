"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Eye, EyeOff } from "lucide-react";
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
      localStorage.setItem("masspay_role", res.user.role);
      localStorage.setItem("masspay_user", JSON.stringify(res.user));
      if (res.user.role === "super_admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background:"#07090F", minHeight:"100vh", display:"flex",
      alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');`}</style>

      <div style={{ width:"100%", maxWidth:420, padding:"0 24px" }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:36 }}>
          <div style={{ width:40, height:40, background:"#E4A730", borderRadius:11,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Layers size={20} color="#000" />
          </div>
          <span style={{ fontFamily:"'Sora',sans-serif", fontWeight:800, fontSize:22, color:"#E4EAF8" }}>
            MassPay<span style={{ color:"#E4A730" }}>BF</span>
          </span>
        </div>

        <div style={{ background:"#111827", border:"1px solid #1C2840", borderRadius:16, padding:32 }}>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700,
            color:"#E4EAF8", margin:"0 0 4px" }}>Connexion</h1>
          <p style={{ color:"#5A6888", fontSize:13, margin:"0 0 24px" }}>Plateforme de virement en masse</p>

          {error && (
            <div style={{ background:"rgba(240,82,82,.13)", border:"1px solid rgba(240,82,82,.3)",
              borderRadius:10, padding:"10px 14px", marginBottom:16, color:"#F05252", fontSize:13 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ color:"#98A5C4", fontSize:11, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".5px", display:"block", marginBottom:7 }}>Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="admin@entreprise.bf"
              style={{ width:"100%", background:"#172035", border:"1px solid #1C2840",
                borderRadius:10, padding:"11px 14px", color:"#E4EAF8",
                fontSize:14, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          <div style={{ marginBottom:24, position:"relative" }}>
            <label style={{ color:"#98A5C4", fontSize:11, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".5px", display:"block", marginBottom:7 }}>Mot de passe</label>
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{ width:"100%", background:"#172035", border:"1px solid #1C2840",
                borderRadius:10, padding:"11px 40px 11px 14px", color:"#E4EAF8",
                fontSize:14, outline:"none", boxSizing:"border-box" }}
            />
            <button onClick={() => setShowPwd(!showPwd)}
              style={{ position:"absolute", right:12, top:34, background:"transparent",
                border:"none", cursor:"pointer", padding:0, color:"#5A6888" }}>
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button onClick={handleLogin} disabled={loading || !email || !password}
            style={{ width:"100%", background: loading || !email || !password ? "#172035" : "#E4A730",
              color: loading || !email || !password ? "#5A6888" : "#000",
              border:"none", padding:"12px", borderRadius:10, fontWeight:700,
              fontSize:15, cursor: loading || !email || !password ? "not-allowed" : "pointer",
              fontFamily:"'Sora',sans-serif", transition:"all .2s" }}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </div>

        <p style={{ textAlign:"center", color:"#5A6888", fontSize:12, marginTop:20 }}>
          MassPay BF · Plateforme B2B de disbursement
        </p>
      </div>
    </div>
  );
}
