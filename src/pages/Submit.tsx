import React, { useMemo, useState } from "react";

type Mode = "VISUAL" | "SPECTRAL" | "RADIO";

function ModeButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button className={`modeBtn ${active ? "active" : ""}`} onClick={onClick} type="button">
      <div className="modeIcon" aria-hidden>
        {icon}
      </div>
      <div className="mono modeLabel">{label}</div>
    </button>
  );
}

export default function SubmitPage() {
  const [mode, setMode] = useState<Mode>("VISUAL");

  const placeholder = useMemo(() => {
    if (mode === "VISUAL") return "e.g. M31, NGC 7000";
    if (mode === "SPECTRAL") return "e.g. H-alpha, OIII, Na D";
    return "e.g. 21cm, Solar burst, meteor scatter";
  }, [mode]);

  return (
    <div className="page">
      <div className="card">
        <div className="mono kicker">DATA LOGGING PROTOCOL</div>
        <div className="h2">Telemetry Stream: ACTIVE</div>
        <div className="hr" />

        <div className="modeRow">
          <ModeButton active={mode === "VISUAL"} label="VISUAL" icon="📷" onClick={() => setMode("VISUAL")} />
          <ModeButton active={mode === "SPECTRAL"} label="SPECTRAL" icon="╫" onClick={() => setMode("SPECTRAL")} />
          <ModeButton active={mode === "RADIO"} label="RADIO" icon="((•))" onClick={() => setMode("RADIO")} />
        </div>

        <div className="field">
          <div className="mono fieldLabel">TARGET OBJECT</div>
          <input className="input" placeholder={placeholder} />
        </div>

        <div className="field">
          <div className="mono fieldLabel">SKY QUALITY (BORTLE SCALE)</div>
          <select className="input">
            <option>Class 1 - Excellent Dark Sky</option>
            <option>Class 2 - Typical Truly Dark</option>
            <option>Class 3 - Rural Sky</option>
            <option>Class 4 - Urban/Rural</option>
            <option>Class 5 - Suburban</option>
            <option>Class 6 - Bright Suburban</option>
            <option>Class 7 - Suburban/Urban</option>
            <option>Class 8 - City Sky</option>
            <option>Class 9 - Inner City</option>
          </select>
        </div>

        <div className="field">
          <div className="mono fieldLabel">EQUIPMENT & SOFTWARE INFRASTRUCTURE</div>
          <textarea
            className="input"
            rows={4}
            placeholder='Specify exact make/model (e.g. SkyWatcher Esprit 100, ZWO ASI6200), extra hardware, and software used (e.g. N.I.N.A, PixInsight).'
          />
          <div className="mono hint">VERIFIED TELEMETRY METADATA REQUIRES PRECISE HARDWARE DOCUMENTATION.</div>
        </div>

        <div className="grid2">
          <div className="field">
            <div className="mono fieldLabel">SEEING (ARCSEC)</div>
            <input className="input" defaultValue="1.5" />
          </div>
          <div className="field">
            <div className="mono fieldLabel">TOTAL INTEGRATION (S)</div>
            <input className="input" defaultValue="300" />
          </div>
        </div>

        <div className="field">
          <div className="mono fieldLabel">TRANSPARENCY (1-5)</div>
          <input type="range" min={1} max={5} defaultValue={3} className="range" />
        </div>

        <div className="field">
          <div className="mono fieldLabel">GAIN / ISO VALUE</div>
          <input className="input" defaultValue="100" />
        </div>

        <div className="hr" />

        <div className="linkBox">
          <div className="mono linkLine">
            <span className="liveDot" /> GLOBAL ARRAY LINK: ESTABLISHED
          </div>
          <div className="mono linkLine">
            <span style={{ color: "var(--cyan)" }}>COORD:</span>&nbsp;40.7128N, 74.0060W&nbsp;&nbsp;&nbsp;
            <span style={{ color: "var(--violet)" }}>ELV:</span>&nbsp;12m
          </div>
        </div>

        <button className="cta" type="button">
          COMMIT DATA TO NETWORK
        </button>
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .modeRow{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px;}
        .modeBtn{padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);display:flex;flex-direction:column;gap:10px;align-items:center;cursor:pointer;transition:.15s;}
        .modeBtn:hover{transform:translateY(-1px);}
        .modeBtn.active{border-color:rgba(0,255,255,.22);box-shadow:0 0 28px rgba(0,255,255,.10);background:rgba(10,16,28,.28);}
        .modeIcon{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);}
        .modeLabel{letter-spacing:.28em;opacity:.8;}
        .field{margin-top:16px;}
        .fieldLabel{opacity:.65;letter-spacing:.22em;font-size:12px;margin-bottom:8px;}
        .input{width:100%;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:rgba(10,16,28,.25);color:rgba(255,255,255,.9);padding:14px 14px;outline:none;}
        .input:focus{border-color:rgba(0,255,255,.22);box-shadow:0 0 0 3px rgba(0,255,255,.08);}
        .hint{margin-top:10px;opacity:.35;letter-spacing:.18em;font-size:11px;}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .range{width:100%;}
        .linkBox{margin-top:6px;padding:16px;border-radius:18px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);}
        .linkLine{letter-spacing:.18em;opacity:.85;margin:4px 0;}
        .liveDot{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--cyan);margin-right:10px;box-shadow:0 0 18px rgba(0,255,255,.2);}
        .cta{margin-top:18px;width:100%;padding:18px 16px;border:none;border-radius:18px;background:linear-gradient(90deg, rgba(120,70,255,.95), rgba(120,70,255,.75));color:white;font-weight:900;letter-spacing:.35em;}
        @media (max-width: 820px){ .grid2{grid-template-columns:1fr;} }
      `}</style>
    </div>
  );
}
