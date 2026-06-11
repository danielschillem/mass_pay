"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { api, auth } from "@/lib/api";
import { LogoMark } from "@/components/layout/Sidebar";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
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
      localStorage.setItem("masspay_tenant_status", res.user.tenant_status ?? "");
      if (res.user.role === "super_admin") {
        router.push("/admin");
      } else if (res.user.tenant_status && res.user.tenant_status !== "active") {
        router.push("/kyb" as Parameters<typeof router.push>[0]);
      } else {
        router.push("/dashboard");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || !email || !password;

  return (
    <main className="login-shell">
      <div className="login-grid">
        <section className="login-card" aria-label="Connexion MynaPay">
          <div className="login-form-header">
            <LogoMark />
            <div className="login-security-chip">
              <ShieldCheck size={14} />
              Session TLS
            </div>
          </div>

          <h1 className="login-title">Connexion sécurisée</h1>
          <p className="login-copy">
            Accédez à votre console de virements, wallet et dossiers KYB avec votre compte MynaPay BF.
          </p>

          {error && (
            <div className="login-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="field">
              <label className="field-label" htmlFor="email">
                <Mail size={13} />
                Adresse email
              </label>
              <input
                id="email"
                className="field-control"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@entreprise.bf"
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">
                <Lock size={13} />
                Mot de passe
              </label>
              <div className="field-wrap">
                <input
                  id="password"
                  className="field-control has-action"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPwd ? "Masquer" : "Afficher"}
                >
                  {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label>
                <input type="checkbox" />
                Terminal reconnu
              </label>
              <span>Accès entreprise</span>
            </div>

            <button type="submit" className="login-submit" disabled={disabled}>
              {loading ? "Vérification..." : "Entrer dans la console"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="login-footnote">
            Les accès super admin et entreprise sont redirigés automatiquement vers leur espace de travail.
          </div>
        </section>

      </div>
    </main>
  );
}
