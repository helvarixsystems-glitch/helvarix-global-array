import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { signIn, signUp } from "../lib/auth";

export function Auth() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = location.state?.from || "/";
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = normalizedEmail.length > 3 && password.length >= 6 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await signUp(normalizedEmail, password);
        if (signUpError) throw signUpError;

        if (!data.session) {
          setInfo("Account created. Check your email for a confirmation link, then sign in.");
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        const { error: signInError } = await signIn(normalizedEmail, password);
        if (signInError) throw signInError;
      }

      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authPage">
      <section className="heroPanel authHero">
        <div className="eyebrow">HELVARIX SYSTEMS</div>
        <h1 className="pageTitle">A cleaner operator gateway for the Global Array.</h1>
        <p className="pageText">
          Sign in to access your observation dashboard, submission tools, ranking history, and membership controls.
        </p>
        <div className="heroStats threeUp compactStats">
          <div className="metricCard">
            <div className="metricLabel">Profiles</div>
            <div className="metricValue">User-linked</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Sessions</div>
            <div className="metricValue">Supabase Auth</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Billing</div>
            <div className="metricValue">Stripe-ready</div>
          </div>
        </div>
      </section>

      <section className="panel authCard">
        <div className="tabRow">
          <button type="button" className={`tabBtn ${mode === "signin" ? "active" : ""}`} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" className={`tabBtn ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>

        <div className="fieldGroup">
          <label className="fieldLabel">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>

        <div className="fieldGroup">
          <label className="fieldLabel">Password</label>
          <div className="inputWithAction">
            <input
              className="input"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button type="button" className="ghostBtn compactBtn" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {info ? <div className="alert info">{info}</div> : null}

        <button className="primaryBtn" type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <div className="helperText">
          This page is intentionally public. Everything else in the app is routed behind authentication.
        </div>
      </section>
    </div>
  );
}
