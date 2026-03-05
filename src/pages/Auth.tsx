import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { signIn, signUp } from "../lib/auth";
import { useNavigate } from "react-router-dom";

export function Auth() {
  const nav = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailNorm = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = emailNorm.length > 3 && pw.length >= 6 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error, data } = await signUp(emailNorm, pw);
        if (error) return setErr(error.message);

        // If email confirmation is enabled, there may be no session yet.
        const hasSession = !!data.session;
        if (!hasSession) {
          setInfo("Check your email to confirm your account, then sign in.");
          setMode("signin");
          setPw("");
          return;
        }

        nav("/");
        return;
      }

      const { error } = await signIn(emailNorm, pw);
      if (error) return setErr(error.message);
      nav("/");
    } catch (e: any) {
      setErr(e?.message ?? "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrap}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: "rgba(41,217,255,0.86)",
            }}
          >
            Helvarix Systems
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.06em" }}>
            Global Array
          </div>
          <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
            {mode === "signin"
              ? "Sign in to access your dashboard, submissions, and score."
              : "Create an account to start contributing observations and earning points."}
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              className={mode === "signin" ? "btnPrimary" : "btnGhost"}
              onClick={() => {
                setMode("signin");
                setErr(null);
                setInfo(null);
              }}
              type="button"
            >
              Sign In
            </button>
            <button
              className={mode === "signup" ? "btnPrimary" : "btnGhost"}
              onClick={() => {
                setMode("signup");
                setErr(null);
                setInfo(null);
              }}
              type="button"
            >
              Create Account
            </button>
          </div>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="input"
            autoComplete="email"
            inputMode="email"
          />

          <div style={{ position: "relative" }}>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password (min 6 characters)"
              type={showPw ? "text" : "password"}
              className="input"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              style={{ paddingRight: 54 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              title={showPw ? "Hide password" : "Show password"}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="btnGhost"
              style={pwToggle}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
          {info && <div style={{ color: "rgba(41,217,255,0.86)" }}>{info}</div>}

          <button
            className="btnPrimary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={busy}
            style={!canSubmit ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          >
            {busy ? "Processing…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>

          <div style={{ color: "var(--muted2)", fontSize: 12, lineHeight: 1.5 }}>
            By continuing, you agree to the platform rules for scientific integrity and respectful collaboration.
          </div>
        </div>
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  maxWidth: 520,
  margin: "10vh auto",
  padding: 16,
};

const pwToggle: CSSProperties = {
  position: "absolute",
  right: 8,
  top: 8,
  width: 72,
  padding: "10px 10px",
  borderRadius: 12,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};
