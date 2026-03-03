import React, { useState } from "react";

type Tab = "SYMBOL" | "COLOR" | "PATTERN";

const symbols = ["☉", "◎", "▣", "▧", "⟐", "⟡", "⌁", "∿"];
const colors = [
  { name: "CYAN", value: "var(--cyan)" },
  { name: "VIOLET", value: "var(--violet)" },
  { name: "AMBER", value: "#b68e2a" },
  { name: "EMERALD", value: "#1aa37a" },
  { name: "ROSE", value: "#b3435a" },
  { name: "WHITE", value: "rgba(255,255,255,.75)" },
];
const patterns = ["SOLID", "COORDINATE GRID", "SCANLINES", "TARGETING", "ORBITAL RINGS"];

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("SYMBOL");
  const [callsign, setCallsign] = useState("Cmdr. Starlight");

  return (
    <div className="page">
      <div className="card hero">
        <div className="heroIcon" aria-hidden />
        <div className="heroName">{callsign}</div>
        <div className="mono heroRole">DEEP SPACE CONTRIBUTOR</div>
        <div className="heroMeta">
          <div className="metaPill mono">STREAK: 12D</div>
          <div className="metaPill mono">SUBMISSIONS: 42</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">OPERATOR VISUAL ID</div>

        <div className="tabs">
          {(["SYMBOL", "COLOR", "PATTERN"] as Tab[]).map((t) => (
            <button key={t} type="button" className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "SYMBOL" ? (
          <div className="grid">
            {symbols.map((s, idx) => (
              <button key={idx} className={`pick ${idx === 0 ? "active" : ""}`} type="button">
                <span className="pickIcon">{s}</span>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "COLOR" ? (
          <div className="grid colorGrid">
            {colors.map((c, idx) => (
              <button key={c.name} className={`colorTile ${idx === 0 ? "active" : ""}`} type="button">
                <div className="swatch" style={{ background: c.value }} />
                <div className="mono colorName">{c.name}</div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "PATTERN" ? (
          <div className="list">
            {patterns.map((p, idx) => (
              <button key={p} className={`listRow ${idx === 1 ? "active" : ""}`} type="button">
                <span className="mono">{p}</span>
                <span className="dot" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="field" style={{ marginTop: 18 }}>
          <div className="mono fieldLabel">CALLSIGN / DESIGNATION</div>
          <input className="input" value={callsign} onChange={(e) => setCallsign(e.target.value)} />
        </div>

        <div className="hr" />

        <div className="statusCard">
          <div className="statusTop">
            <div>
              <div className="statusTitle">Validator Program</div>
              <div className="mono statusSub">RANK RESTRICTION: SPECIALIST+</div>
            </div>
            <div className="mono statusOpt">OPT-IN</div>
          </div>
        </div>

        <div className="statusCard">
          <div className="statusTop">
            <div>
              <div className="mono statusSub">EQUIPMENT INDEX</div>
              <div className="statusTitle">Advanced Telescope</div>
            </div>
            <div className="mono statusOpt">▦</div>
          </div>
        </div>

        <div className="proCard">
          <div className="proTitle">HELVARIX PRO TIER</div>
          <div className="proDesc">
            Advanced analytical precision, predictive simulation, and priority certification. Elevate your observation strategy without compromising network integrity.
          </div>

          {/* Hook this button to your Stripe checkout function (keep your existing logic) */}
          <button className="cta" type="button">
            ENROLL PROTOCOL • $15 / MONTH
          </button>

          <div className="proFeat">
            <div className="featTitle">ADVANCED PLANNER</div>
            <div className="featDesc">AI-driven target optimization based on GPS and local seeing.</div>
          </div>
          <div className="proFeat">
            <div className="featTitle">DATA ANALYTICS</div>
            <div className="featDesc">Signal-to-noise heatmaps and calibration audit tools.</div>
          </div>
          <div className="proFeat">
            <div className="featTitle">SKY SIMULATION</div>
            <div className="featDesc">High-precision historical reconstruction and FOV preview.</div>
          </div>
          <div className="proFeat">
            <div className="featTitle">TEAM OBSERVATORY</div>
            <div className="featDesc">Coordinate multi-site observations with private dashboards.</div>
          </div>
        </div>
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .hero{padding:22px;text-align:center;}
        .heroIcon{width:96px;height:96px;border-radius:26px;margin:4px auto 14px;background:
          linear-gradient(rgba(0,255,255,.14), rgba(10,16,28,.18)),
          repeating-linear-gradient(0deg, rgba(0,255,255,.14) 0 1px, transparent 1px 14px),
          repeating-linear-gradient(90deg, rgba(0,255,255,.10) 0 1px, transparent 1px 14px);
          border:1px solid rgba(0,255,255,.18);
          box-shadow:0 0 28px rgba(0,255,255,.10);
        }
        .heroName{font-size:36px;font-weight:900;}
        .heroRole{margin-top:6px;color:rgba(0,255,255,.75);letter-spacing:.35em;}
        .heroMeta{margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
        .metaPill{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.28);}
        .tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;}
        .tab{padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);color:rgba(255,255,255,.75);letter-spacing:.22em;font-weight:900;}
        .tab.active{border-color:rgba(0,255,255,.22);box-shadow:0 0 18px rgba(0,255,255,.08);color:white;}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px;}
        .pick{height:78px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);display:grid;place-items:center;}
        .pick.active{border-color:rgba(0,255,255,.22);background:rgba(10,16,28,.28);}
        .pickIcon{font-size:34px;opacity:.85}
        .colorGrid{grid-template-columns:repeat(3,1fr);}
        .colorTile{padding:10px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);text-align:center;}
        .colorTile.active{border-color:rgba(0,255,255,.22);}
        .swatch{height:92px;border-radius:14px;border:1px solid rgba(255,255,255,.10);}
        .colorName{margin-top:10px;opacity:.65;letter-spacing:.22em;font-size:12px;}
        .list{display:flex;flex-direction:column;gap:10px;margin-top:14px;}
        .listRow{display:flex;justify-content:space-between;align-items:center;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);color:rgba(255,255,255,.75);}
        .listRow.active{border-color:rgba(0,255,255,.22);box-shadow:0 0 18px rgba(0,255,255,.08);}
        .dot{width:10px;height:10px;border-radius:999px;background:rgba(255,255,255,.12);}
        .listRow.active .dot{background:var(--cyan);box-shadow:0 0 18px rgba(0,255,255,.18);}
        .fieldLabel{opacity:.65;letter-spacing:.22em;font-size:12px;margin-bottom:8px;}
        .input{width:100%;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:rgba(10,16,28,.25);color:rgba(255,255,255,.9);padding:14px;}
        .statusCard{margin-top:12px;padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);}
        .statusTop{display:flex;justify-content:space-between;gap:10px;align-items:center;}
        .statusTitle{font-weight:900;font-size:20px;}
        .statusSub{opacity:.6;letter-spacing:.18em;font-size:12px;margin-top:4px;}
        .statusOpt{opacity:.45;letter-spacing:.22em;}
        .proCard{margin-top:16px;padding:18px;border-radius:22px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);position:relative;overflow:hidden;}
        .proCard:before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 70% 20%, rgba(160,110,255,.18), transparent 60%);pointer-events:none;}
        .proTitle{font-size:28px;font-weight:900;font-style:italic;}
        .proDesc{margin-top:10px;opacity:.72;line-height:1.55;max-width:70ch;}
        .cta{margin-top:16px;width:100%;padding:16px;border:none;border-radius:18px;background:linear-gradient(90deg, rgba(120,70,255,.95), rgba(120,70,255,.75));color:white;font-weight:900;letter-spacing:.22em;}
        .proFeat{margin-top:12px;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.18);opacity:.75}
        .featTitle{font-weight:900;letter-spacing:.12em;}
        .featDesc{margin-top:6px;opacity:.7}
        @media (max-width: 820px){
          .grid{grid-template-columns:repeat(3,1fr);}
        }
      `}</style>
    </div>
  );
}
