import React from "react";

export default function CollectivePage() {
  return (
    <div className="page">
      <div className="card">
        <div className="mono kicker">COLLECTIVE OPERATIONS</div>
        <div className="h2">Helvarix Observatory Network</div>
        <div className="hr" />

        <div className="card dim">
          <div className="mono" style={{ letterSpacing: ".22em", opacity: 0.8 }}>
            COORDINATE WITH OTHER OBSERVERS VIA TEAM OBSERVATORY MODE.
          </div>
          <button className="ghost" type="button">
            INITIALIZE TEAM
          </button>
        </div>

        <div className="hr" />

        <div className="sectionTitle">
          <span className="dot violet" />
          <div>
            <div className="h1">PRESTIGE CERTIFICATION</div>
            <div className="mono sub">Priority validation • protocol access</div>
          </div>
        </div>

        <div className="certCard">
          <div className="mono certTop">
            <span>PROGRESS TO LEVEL 1</span>
            <span>82%</span>
          </div>
          <div className="progressWrap">
            <div className="progressFill" style={{ width: "82%", background: "linear-gradient(90deg, var(--cyan), var(--violet))" }} />
          </div>
          <button className="ghost" type="button" style={{ marginTop: 14, opacity: 0.7 }}>
            CERTIFICATION AUDIT
          </button>
        </div>
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .ghost{margin-top:14px;width:100%;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:rgba(10,16,28,.22);color:rgba(255,255,255,.75);letter-spacing:.22em;font-weight:800;}
        .dot{width:8px;height:8px;border-radius:999px;margin-top:10px;}
        .dot.violet{background:var(--violet);box-shadow:0 0 18px rgba(160,110,255,.25);}
        .sectionTitle{display:flex;gap:10px;align-items:flex-start;margin:8px 0 10px;}
        .certCard{padding:16px;border-radius:18px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);}
        .certTop{display:flex;justify-content:space-between;opacity:.7;letter-spacing:.22em;font-size:12px;margin-bottom:10px;}
        .progressWrap{height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;border:1px solid rgba(255,255,255,.06);}
        .progressFill{height:100%;border-radius:999px;}
      `}</style>
    </div>
  );
}
