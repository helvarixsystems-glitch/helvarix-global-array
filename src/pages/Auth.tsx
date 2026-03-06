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
    <div className="authPageV3">
      <style>{`
        :root{
          --auth-bg:#050914;
          --auth-panel:rgba(10,16,30,.78);
          --auth-panel-2:rgba(8,13,24,.92);
          --auth-stroke:rgba(255,255,255,.09);
          --auth-stroke-strong:rgba(56,242,255,.22);
          --auth-text:rgba(255,255,255,.95);
          --auth-muted:rgba(255,255,255,.66);
          --auth-dim:rgba(255,255,255,.44);
          --auth-cyan:#39e7ff;
          --auth-violet:#8d77ff;
          --auth-violet-2:#6f5cff;
          --auth-success:#67e8a5;
          --auth-danger:#ff7a92;
          --auth-shadow:0 24px 80px rgba(0,0,0,.34);
          --auth-radius:28px;
        }

        .authPageV3{
          min-height:100vh;
          color:var(--auth-text);
          background:
            radial-gradient(900px 520px at 0% 0%, rgba(57,231,255,.12), transparent 48%),
            radial-gradient(700px 520px at 100% 0%, rgba(141,119,255,.14), transparent 46%),
            linear-gradient(180deg, #030711 0%, #050914 40%, #06101c 100%);
          padding: 36px 20px 40px;
        }

        .authShell{
          max-width: 1220px;
          margin: 0 auto;
        }

        .authTopbar{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          margin-bottom: 26px;
        }

        .authBrand{
          display:flex;
          align-items:center;
          gap:14px;
        }

        .authMark{
          width:44px;
          height:44px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.08);
          background:
            radial-gradient(circle at 30% 30%, rgba(57,231,255,.46), transparent 42%),
            radial-gradient(circle at 72% 72%, rgba(141,119,255,.32), transparent 54%),
            rgba(255,255,255,.04);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          flex-shrink:0;
        }

        .eyebrow{
          font-size:12px;
          text-transform:uppercase;
          letter-spacing:.22em;
          color:var(--auth-cyan);
          font-weight:800;
        }

        .topTitle{
          margin-top:4px;
          font-size:14px;
          color:var(--auth-muted);
        }

        .topPill{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:46px;
          padding:0 18px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.04);
          color:var(--auth-text);
          font-weight:700;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }

        .authGrid{
          display:grid;
          grid-template-columns: 1.12fr .88fr;
          gap:22px;
          align-items:stretch;
        }

        @media (max-width: 1040px){
          .authGrid{
            grid-template-columns:1fr;
          }
        }

        .authPanel{
          position:relative;
          overflow:hidden;
          border-radius:var(--auth-radius);
          border:1px solid var(--auth-stroke);
          background:
            linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015)),
            var(--auth-panel);
          box-shadow:var(--auth-shadow);
          backdrop-filter: blur(16px);
        }

        .heroPanel{
          padding:34px 30px 30px;
          min-height:100%;
        }

        .heroPanel::before{
          content:"";
          position:absolute;
          right:-120px;
          top:-80px;
          width:320px;
          height:320px;
          border-radius:50%;
          background: radial-gradient(circle, rgba(57,231,255,.12), transparent 65%);
          pointer-events:none;
        }

        .heroPanel::after{
          content:"";
          position:absolute;
          left:-80px;
          bottom:-120px;
          width:280px;
          height:280px;
          border-radius:50%;
          background: radial-gradient(circle, rgba(141,119,255,.12), transparent 68%);
          pointer-events:none;
        }

        .heroInner{
          position:relative;
          z-index:1;
        }

        .heroKicker{
          margin-bottom:18px;
        }

        .heroTitle{
          margin:0;
          max-width:740px;
          font-size: clamp(38px, 5.2vw, 68px);
          line-height:.98;
          letter-spacing:-.045em;
          font-weight:900;
        }

        .heroText{
          margin:20px 0 0;
          max-width:760px;
          font-size:20px;
          line-height:1.55;
          color:var(--auth-muted);
        }

        .heroMeta{
          margin-top:26px;
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap:14px;
        }

        @media (max-width: 680px){
          .heroMeta{
            grid-template-columns:1fr;
          }
        }

        .metaCard{
          border-radius:22px;
          border:1px solid rgba(255,255,255,.06);
          background:rgba(255,255,255,.03);
          padding:18px 18px 20px;
          min-height:120px;
          display:flex;
          flex-direction:column;
          justify-content:space-between;
        }

        .metaLabel{
          font-size:13px;
          color:var(--auth-muted);
          letter-spacing:.02em;
        }

        .metaValue{
          margin-top:10px;
          font-size:28px;
          line-height:1.05;
          font-weight:850;
          letter-spacing:-.03em;
        }

        .metaSub{
          margin-top:12px;
          font-size:13px;
          color:var(--auth-dim);
          line-height:1.4;
        }

        .authCard{
          padding:20px;
          display:flex;
          align-items:center;
        }

        .authCardInner{
          width:100%;
          border-radius:24px;
          border:1px solid rgba(255,255,255,.07);
          background:
            linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01)),
            var(--auth-panel-2);
          padding:22px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
        }

        .authHeader{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom:18px;
        }

        .authTitle{
          margin:6px 0 0;
          font-size:28px;
          line-height:1.05;
          font-weight:900;
          letter-spacing:-.03em;
        }

        .authSubtext{
          margin-top:8px;
          color:var(--auth-muted);
          font-size:14px;
          line-height:1.5;
          max-width:420px;
        }

        .statusDot{
          width:10px;
          height:10px;
          border-radius:50%;
          background:var(--auth-success);
          box-shadow:0 0 16px rgba(103,232,165,.55);
          margin-top:8px;
          flex-shrink:0;
        }

        .modeSwitch{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
          padding:6px;
          border-radius:18px;
          background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.06);
          margin-bottom:22px;
        }

        .modeBtn{
          min-height:56px;
          border:none;
          border-radius:14px;
          background:transparent;
          color:var(--auth-muted);
          font-weight:800;
          font-size:18px;
          cursor:pointer;
          transition:.16s ease;
        }

        .modeBtn:hover{
          color:var(--auth-text);
          background:rgba(255,255,255,.03);
        }

        .modeBtn.active{
          color:var(--auth-text);
          background:linear-gradient(180deg, rgba(57,231,255,.12), rgba(57,231,255,.06));
          border:1px solid var(--auth-stroke-strong);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        }

        .formStack{
          display:flex;
          flex-direction:column;
          gap:18px;
          width:100%;
        }

        .fieldGroup{
          display:flex;
          flex-direction:column;
          gap:10px;
          width:100%;
        }

        .fieldLabel{
          font-size:12px;
          text-transform:uppercase;
          letter-spacing:.2em;
          color:var(--auth-cyan);
          font-weight:800;
          padding-left:2px;
        }

        .input{
          width:100%;
          min-height:72px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(0,0,0,.28);
          color:var(--auth-text);
          font-size:20px;
          padding:0 20px;
          outline:none;
          transition:border-color .14s ease, box-shadow .14s ease, background .14s ease;
          box-sizing:border-box;
          display:block;
        }

        .input::placeholder{
          color:rgba(255,255,255,.28);
        }

        .input:focus{
          border-color:rgba(57,231,255,.3);
          box-shadow:0 0 0 4px rgba(57,231,255,.08);
          background:rgba(0,0,0,.34);
        }

        .pwToggle{
          min-height:54px;
          padding:0 18px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.035);
          color:var(--auth-text);
          font-size:15px;
          font-weight:700;
          cursor:pointer;
          transition:.14s ease;
          align-self:flex-start;
        }

        .pwToggle:hover{
          background:rgba(255,255,255,.055);
          border-color:rgba(255,255,255,.14);
        }

        .primaryBtn{
          width:100%;
          min-height:60px;
          border:none;
          border-radius:18px;
          background:linear-gradient(135deg, var(--auth-violet), var(--auth-violet-2));
          color:#fff;
          font-size:19px;
          font-weight:900;
          letter-spacing:-.01em;
          cursor:pointer;
          transition:transform .14s ease, filter .14s ease, opacity .14s ease;
          box-shadow:0 12px 34px rgba(111,92,255,.28);
        }

        .primaryBtn:hover:not(:disabled){
          transform:translateY(-1px);
          filter:brightness(1.04);
        }

        .primaryBtn:disabled{
          opacity:.48;
          cursor:not-allowed;
          box-shadow:none;
        }

        .alert{
          border-radius:18px;
          padding:14px 15px;
          font-size:14px;
          line-height:1.5;
          border:1px solid transparent;
        }

        .alert.error{
          background:rgba(255,122,146,.08);
          border-color:rgba(255,122,146,.2);
          color:#ffc0cc;
        }

        .alert.info{
          background:rgba(57,231,255,.08);
          border-color:rgba(57,231,255,.18);
          color:#b8f7ff;
        }

        .helperBlock{
          margin-top:16px;
          padding-top:16px;
          border-top:1px solid rgba(255,255,255,.06);
        }

        .helperText{
          font-size:14px;
          line-height:1.55;
          color:var(--auth-muted);
        }

        .helperCaps{
          margin-top:12px;
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }

        .helperChip{
          display:inline-flex;
          align-items:center;
          min-height:30px;
          padding:0 10px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
          color:var(--auth-dim);
          font-size:11px;
          font-weight:800;
          letter-spacing:.14em;
          text-transform:uppercase;
        }

        @media (max-width: 640px){
          .authPageV3{
            padding:20px 14px 26px;
          }

          .authTopbar{
            margin-bottom:18px;
          }

          .topPill{
            display:none;
          }

          .heroPanel{
            padding:24px 20px 22px;
          }

          .authCard{
            padding:14px;
          }

          .authCardInner{
            padding:16px;
          }

          .heroText{
            font-size:16px;
          }

          .authTitle{
            font-size:24px;
          }

          .modeBtn{
            font-size:16px;
            min-height:52px;
          }

          .input{
            min-height:64px;
            font-size:17px;
            padding:0 16px;
          }

          .pwToggle{
            min-height:48px;
            font-size:14px;
          }

          .primaryBtn{
            min-height:56px;
            font-size:17px;
          }
        }
      `}</style>

      <div className="authShell">
        <div className="authTopbar">
          <div className="authBrand">
            <div className="authMark" />
            <div>
              <div className="eyebrow">Operator Access</div>
              <div className="topTitle">Sign in or create your Helvarix Global Array account.</div>
            </div>
          </div>

          <div className="topPill">Secure Auth Gateway</div>
        </div>

        <div className="authGrid">
          <section className="authPanel heroPanel">
            <div className="heroInner">
              <div className="heroKicker eyebrow">Helvarix Systems</div>

              <h1 className="heroTitle">
                A cleaner operator gateway for the Global Array.
              </h1>

              <p className="heroText">
                Access your observation dashboard, submission tools, ranking history, campaign
                participation, and membership controls through a focused operator login surface
                that matches the rest of the platform.
              </p>

              <div className="heroMeta">
                <div className="metaCard">
                  <div className="metaLabel">Profiles</div>
                  <div className="metaValue">User-linked</div>
                  <div className="metaSub">Account-specific identity and operator continuity.</div>
                </div>

                <div className="metaCard">
                  <div className="metaLabel">Sessions</div>
                  <div className="metaValue">Supabase Auth</div>
                  <div className="metaSub">Secure sign-in and account session management.</div>
                </div>

                <div className="metaCard">
                  <div className="metaLabel">Billing</div>
                  <div className="metaValue">Stripe-ready</div>
                  <div className="metaSub">Membership and payment controls remain intact.</div>
                </div>
              </div>
            </div>
          </section>

          <section className="authPanel authCard">
            <div className="authCardInner">
              <div className="authHeader">
                <div>
                  <div className="eyebrow">{mode === "signin" ? "Sign in" : "Create account"}</div>
                  <div className="authTitle">
                    {mode === "signin" ? "Operator authentication" : "Provision new operator access"}
                  </div>
                  <div className="authSubtext">
                    {mode === "signin"
                      ? "Use your existing Helvarix account credentials to enter the platform."
                      : "Create a new account to access the Global Array and begin submitting observations."}
                  </div>
                </div>

                <div className="statusDot" aria-hidden="true" />
              </div>

              <div className="modeSwitch">
                <button
                  type="button"
                  className={`modeBtn ${mode === "signin" ? "active" : ""}`}
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`modeBtn ${mode === "signup" ? "active" : ""}`}
                  onClick={() => setMode("signup")}
                >
                  Create account
                </button>
              </div>

              <div className="formStack">
                <div className="fieldGroup">
                  <label className="fieldLabel">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="operator@helvarix.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Password</label>
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    placeholder={mode === "signin" ? "Enter your password" : "Minimum 6 characters"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                  <button
                    type="button"
                    className="pwToggle"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? "Hide password" : "Show password"}
                  </button>
                </div>

                {error ? <div className="alert error">{error}</div> : null}
                {info ? <div className="alert info">{info}</div> : null}

                <button
                  className="primaryBtn"
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </div>

              <div className="helperBlock">
                <div className="helperText">
                  This page is intentionally public. Everything else in the application is routed
                  behind authentication and session-aware access control.
                </div>

                <div className="helperCaps">
                  <span className="helperChip">Public entry</span>
                  <span className="helperChip">Secure sessions</span>
                  <span className="helperChip">Backend unchanged</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
