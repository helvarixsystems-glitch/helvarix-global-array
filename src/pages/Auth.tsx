import { useState } from "react";
import { signIn, signUp } from "../lib/auth";
import { useNavigate } from "react-router-dom";

export function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onSignup() {
    setErr(null);
    const { error } = await signUp(email, pw);
    if (error) return setErr(error.message);
    // If email confirmation is enabled, user will need to confirm first.
    nav("/");
  }

  async function onSignin() {
    setErr(null);
    const { error } = await signIn(email, pw);
    if (error) return setErr(error.message);
    nav("/");
  }

  return (
    <div style={{ maxWidth: 520, margin: "8vh auto", padding: 16 }}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Helvarix Global Array</div>
        <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
          Sign in with email + password.
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inp}
          />
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            type="password"
            style={inp}
          />
          {err && <div style={{ color: "#fca5a5" }}>{err}</div>}
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <button className="btn-primary" onClick={onSignin}>Sign In</button>
            <button className="btn-primary" onClick={onSignup}>Create</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid rgba(52,211,255,0.18)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  outline: "none",
};
