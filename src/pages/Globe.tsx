import React from "react";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="miniPanel">
      <div className="mono miniLabel">{label}</div>
      <div className="miniValue">{value}</div>
    </div>
  );
}

export default function GlobePage() {
  return (
    <div className="page">
      <div className="card">
        <div className="mono kicker">GLOBAL OBSERVATION ARRAY</div>
        <div className="h2">Live Feed</div>
        <div className="hr" />

        <div className="globeWrap">
          <div className="globeGrid" />
          <div className="globeDots">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="dot" style={{ left: `${10 + (i * 5) % 80}%`, top: `${12 + (i * 9) % 70}%` }} />
            ))}
          </div>

          <div className="globeOverlay">
            <div className="overlayPill mono">
              <span className="liveDot" /> ACTIVE NODES: <span style={{ color: "var(--cyan)" }}>4,129</span>
            </div>
            <div className="overlayPill mono" style={{ marginTop: 10 }}>
              <span className="liveDot violet" /> COLLECTING DATA: <span style={{ color: "var(--violet)" }}>892</span>
            </div>
          </div>

          <div className="hemis">
            <div className="hemi">
              <div className="mono hemiLabel">NORTHERN HEMISPHERE</div>
              <div className="hemiVal">62%</div>
            </div>
            <div className="hemi">
              <div className="mono hemiLabel">SOUTHERN HEMISPHERE</div>
              <div className="hemiVal">38%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="twoCol">
        <Metric label="LINK STATUS" value="ESTABLISHED" />
        <Metric label="SYNC WINDOW" value="LIVE" />
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .globeWrap{position:relative;border-radius:22px;overflow:hidden;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);padding:16px;min-height:420px;}
        .globeGrid{position:absolute;inset:0;background:
          linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
          background-size:34px 34px;opacity:.25;}
        .globeDots{position:absolute;inset:0;}
        .globeDots .dot{position:absolute;width:10px;height:10px;border-radius:999px;background:rgba(0,255,255,.55);box-shadow:0 0 18px rgba(0,255,255,.18);}
        .globeOverlay{position:absolute;right:18px;top:18px;}
        .overlayPill{padding:12px 14px;border-radius:14px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.35);letter-spacing:.18em}
        .liveDot{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--cyan);margin-right:10px;box-shadow:0 0 18px rgba(0,255,255,.2);}
        .liveDot.violet{background:var(--violet);box-shadow:0 0 18px rgba(160,110,255,.18);}
        .hemis{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.18);}
        .hemi{padding:18px;text-align:center;border-right:1px solid rgba(255,255,255,.08);}
        .hemi:last-child{border-right:none;}
        .hemiLabel{opacity:.65;letter-spacing:.22em;font-size:12px;}
        .hemiVal{margin-top:10px;font-size:40px;font-weight:900;}
        .twoCol{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .miniPanel{padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.24);text-align:center;}
        .miniLabel{opacity:.65;letter-spacing:.22em;font-size:12px;}
        .miniValue{margin-top:8px;font-size:28px;font-weight:900;}
        @media (max-width: 820px){ .twoCol{grid-template-columns:1fr;} }
      `}</style>
    </div>
  );
}
