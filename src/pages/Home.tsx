import React, { useMemo } from "react";

type Campaign = {
  cadence: "DAILY" | "WEEKLY" | "GLOBAL";
  title: string;
  desc: string;
  endsIn: string;
  progress: number; // 0..1
  accent: "cyan" | "violet";
};

function ProgressBar({ value, accent }: { value: number; accent: "cyan" | "violet" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const from = accent === "cyan" ? "var(--cyan)" : "var(--violet)";
  const to = accent === "cyan" ? "var(--violet)" : "var(--cyan)";
  return (
    <div className="progressWrap">
      <div
        className="progressFill"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${from}, ${to})`,
        }}
      />
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "cyan" | "violet" | "neutral" }) {
  const cls = `chip ${tone}`;
  return <span className={cls}>{children}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="statTile">
      <div className="mono statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

export default function HomePage() {
  const campaigns: Campaign[] = useMemo(
    () => [
      {
        cadence: "DAILY",
        title: "Capture Jupiter",
        desc: "Submit high-resolution planetary imaging. Prioritize sharpness + color balance.",
        endsIn: "ENDS IN 14H",
        progress: 0.62,
        accent: "cyan",
      },
      {
        cadence: "WEEKLY",
        title: "Globular Clusters",
        desc: "Image M13 or M92 with clean stars and stable tracking.",
        endsIn: "ENDS IN 3D",
        progress: 0.48,
        accent: "violet",
      },
      {
        cadence: "GLOBAL",
        title: "Hydrogen Line Mapping Event",
        desc: "Coordinated 21cm capture across many nodes. (Beta event placeholder.)",
        endsIn: "ACTIVE",
        progress: 0.31,
        accent: "cyan",
      },
    ],
    []
  );

  return (
    <div className="page">
      <div className="card heroCard">
        <div className="heroTop">
          <div className="heroMark" aria-hidden>
            <div className="markGrid" />
            <div className="markGlyph" />
          </div>

          <div className="heroText">
            <div className="mono kickerRow">
              <span className="dot cyan" /> HELVARIX GLOBAL ARRAY
            </div>
            <div className="heroName">Cmdr. Starlight</div>
            <div className="mono heroRole">DEEP SPACE CONTRIBUTOR</div>

            <div className="heroMeta">
              <div className="metaPill mono">STREAK: 12D</div>
              <div className="metaPill mono">SUBMISSIONS: 42</div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="heroStats">
          <StatTile label="OBSERVATION INDEX" value="24,500" />
          <StatTile label="CAMPAIGN IMPACT" value="1,200" />
        </div>

        <div className="divider" />

        <div className="progressBlock">
          <div className="mono progressLabel">PROGRESSION PROTOCOL</div>
          <div className="progressRow">
            <div className="nextRank mono">Next: NETWORK SPECIALIST</div>
            <div className="remaining mono" style={{ color: "var(--cyan)" }}>
              25,500 OI REMAINING
            </div>
          </div>
          <ProgressBar value={0.22} accent="violet" />
        </div>
      </div>

      <div className="sectionTitle">
        <span className="dot cyan" />
        <div>
          <div className="h1">ACTIVE CAMPAIGNS</div>
          <div className="mono sub">Daily • Weekly • Global</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">CAMPAIGN OPERATIONS</div>
        <div className="h2">Active Campaigns</div>
        <div className="hr" />

        <div className="stack">
          {campaigns.map((c) => (
            <div key={c.title} className="campaignCard">
              <div className="campaignTop">
                <div className="mono campaignCadence" style={{ color: c.cadence === "WEEKLY" ? "var(--violet)" : "var(--cyan)" }}>
                  {c.cadence}
                </div>
                <div className="mono campaignEnds">{c.endsIn}</div>
              </div>

              <div className="campaignTitle">{c.title}</div>
              <div className="campaignDesc">{c.desc}</div>

              <div style={{ marginTop: 14 }}>
                <ProgressBar value={c.progress} accent={c.accent} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sectionTitle" style={{ marginTop: 22 }}>
        <span className="dot violet" />
        <div>
          <div className="h1">NETWORK ACTIVITY</div>
          <div className="mono sub">Traffic analysis • submissions • peer review</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">TRAFFIC ANALYSIS</div>
        <div className="h2">Global Telemetry Flow</div>
        <div className="hr" />

        <div className="chartMock">
          <div className="chartLegend mono">
            <span className="legendDot violet" /> PEER REVIEWS
            <span className="legendDot cyan" style={{ marginLeft: 16 }} /> SUBMISSIONS
          </div>
          <div className="chartBars">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d, i) => (
              <div className="barCol" key={d}>
                <div className="bar violet" style={{ height: `${22 + i * 7}%` }} />
                <div className="bar cyan" style={{ height: `${34 + i * 6}%` }} />
                <div className="mono barLabel">{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="hr" />

        <div className="twoCol">
          <div className="miniPanel">
            <div className="mono miniLabel">VISIBLE SPECTRUM</div>
            <div className="miniValue">92.1%</div>
          </div>
          <div className="miniPanel">
            <div className="mono miniLabel">AVG PEER VALIDATION</div>
            <div className="miniValue">1.4x</div>
          </div>
        </div>

        <div className="hr" />

        <div className="sectorPanel">
          <div className="sectorHead">
            <div className="mono sectorTitle">
              <span className="diamond" /> SECTOR ANALYSIS
            </div>
            <div className="mono sectorCoords">40.7128N / -74.0060W</div>
          </div>

          <div className="sectorQuote">
            <div className="quoteBar" />
            <div className="quoteText">“Initializing localized telemetry stream…”</div>
          </div>

          <div className="metricRow">
            <div className="metricCard">
              <div className="mono metricLabel">PHOTON FLUX STABILITY</div>
              <div className="metricRight mono" style={{ color: "var(--cyan)" }}>
                98.2%
              </div>
              <ProgressBar value={0.982} accent="cyan" />
            </div>

            <div className="metricCard">
              <div className="mono metricLabel">MAGNETOSPHERIC INTERFERENCE</div>
              <div className="metricRight mono" style={{ color: "#e4b73a" }}>
                LOW
              </div>
              <div className="progressWrap">
                <div className="progressFill" style={{ width: `18%`, background: `linear-gradient(90deg, #e4b73a, rgba(228,183,58,0.15))` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="zenith">
          <div className="zenHead">
            <div className="mono sectorTitle" style={{ color: "var(--violet)" }}>
              <span className="diamond" /> ZENITH AIRMASS FORECAST
            </div>
            <div className="mono zenLegend">
              <span className="legendDot cyan" /> SEEING (″)
              <span className="legendDot violet" style={{ marginLeft: 12 }} /> AIRMASS
            </div>
          </div>

          <div className="zenChart">
            <div className="zenGrid" />
            <div className="zenLine violet" />
            <div className="zenLine cyan dashed" />
            <div className="mono zenAxis">20:00&nbsp;&nbsp;21:00&nbsp;&nbsp;22:00&nbsp;&nbsp;23:00&nbsp;&nbsp;00:00&nbsp;&nbsp;01:00&nbsp;&nbsp;02:00</div>
          </div>

          <div className="zenFooter">
            <div className="zenTile">
              <div className="mono miniLabel">OPTIMAL COLLECTION START</div>
              <div className="miniValue">22:45 UTC</div>
            </div>
            <div className="zenTile">
              <div className="mono miniLabel">PEAK ALTITUDE VISIBILITY</div>
              <div className="miniValue">Zenith (90°)</div>
            </div>
            <div className="zenTile">
              <div className="mono miniLabel">NIGHT DURATION REMAINING</div>
              <div className="miniValue" style={{ color: "var(--cyan)" }}>
                06H 12M
              </div>
            </div>
          </div>

          <div className="hr" />

          <div className="quickActions">
            <Chip tone="cyan">GLOBAL ARRAY LINK: ESTABLISHED</Chip>
            <Chip tone="neutral">COORD: 40.7128N, 74.0060W</Chip>
            <Chip tone="violet">ELV: 12m</Chip>
          </div>
        </div>
      </div>

      {/* Minimal page-local CSS hooks (uses your existing theme vars) */}
      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .heroCard{padding:22px;}
        .heroTop{display:flex;gap:16px;align-items:center;}
        .heroMark{width:74px;height:74px;border-radius:18px;position:relative;overflow:hidden;background:rgba(9,20,40,.55);border:1px solid rgba(0,255,255,.18);}
        .markGrid{position:absolute;inset:-40%;background:
          linear-gradient(rgba(0,255,255,.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,255,.08) 1px, transparent 1px);
          background-size:14px 14px;transform:rotate(0.02turn);}
        .markGlyph{position:absolute;inset:0;display:grid;place-items:center;}
        .markGlyph:before{content:"";width:30px;height:30px;border-radius:999px;border:3px solid rgba(0,255,255,.65);box-shadow:0 0 22px rgba(0,255,255,.22);}
        .markGlyph:after{content:"";position:absolute;width:50px;height:50px;border-radius:999px;border:2px dashed rgba(160,110,255,.35);}
        .heroText{flex:1;min-width:0;}
        .kickerRow{letter-spacing:.22em;font-weight:800;font-size:12px;color:rgba(0,255,255,.75);display:flex;align-items:center;gap:10px;}
        .heroName{font-size:34px;font-weight:900;line-height:1.1;margin-top:6px;}
        .heroRole{margin-top:4px;color:rgba(0,255,255,.75);letter-spacing:.35em;}
        .heroMeta{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;}
        .metaPill{padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);}
        .divider{height:1px;background:rgba(255,255,255,.08);margin:16px 0;}
        .heroStats{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .statTile{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);}
        .statLabel{opacity:.7;letter-spacing:.22em;font-size:12px;}
        .statValue{margin-top:8px;font-size:34px;font-weight:900;color:rgba(255,255,255,.92);}
        .progressBlock{display:flex;flex-direction:column;gap:10px;}
        .progressLabel{opacity:.7;letter-spacing:.22em;font-size:12px;}
        .progressRow{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
        .progressWrap{height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;border:1px solid rgba(255,255,255,.06);}
        .progressFill{height:100%;border-radius:999px;}
        .sectionTitle{display:flex;gap:10px;align-items:flex-start;margin-top:8px;}
        .dot{width:8px;height:8px;border-radius:999px;margin-top:10px;}
        .dot.cyan{background:var(--cyan);box-shadow:0 0 18px rgba(0,255,255,.25);}
        .dot.violet{background:var(--violet);box-shadow:0 0 18px rgba(160,110,255,.25);}
        .stack{display:flex;flex-direction:column;gap:12px;margin-top:12px;}
        .campaignCard{padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.28);}
        .campaignTop{display:flex;justify-content:space-between;align-items:center;gap:10px;}
        .campaignCadence{letter-spacing:.32em;font-weight:900;font-size:12px;}
        .campaignEnds{opacity:.55;letter-spacing:.22em;font-size:12px;}
        .campaignTitle{font-size:22px;font-weight:900;margin-top:8px;}
        .campaignDesc{margin-top:6px;opacity:.72;line-height:1.5;}
        .chartMock{padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.24);}
        .chartLegend{opacity:.8;letter-spacing:.18em;font-size:12px;display:flex;align-items:center;gap:8px;margin-bottom:14px;}
        .legendDot{width:10px;height:10px;border-radius:999px;display:inline-block;vertical-align:middle;}
        .legendDot.cyan{background:var(--cyan);}
        .legendDot.violet{background:var(--violet);}
        .chartBars{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;align-items:end;height:220px;padding:8px 6px;}
        .barCol{display:flex;flex-direction:column;align-items:center;gap:6px;}
        .bar{width:18px;border-radius:10px;opacity:.92;}
        .bar.cyan{background:rgba(0,255,255,.75);box-shadow:0 0 18px rgba(0,255,255,.12);}
        .bar.violet{background:rgba(160,110,255,.75);box-shadow:0 0 18px rgba(160,110,255,.12);}
        .barLabel{opacity:.55;letter-spacing:.18em;font-size:11px;margin-top:6px;}
        .twoCol{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .miniPanel{padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.24);text-align:center;}
        .miniLabel{opacity:.65;letter-spacing:.22em;font-size:12px;}
        .miniValue{margin-top:8px;font-size:30px;font-weight:900;}
        .sectorPanel{padding:16px;border-radius:18px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);}
        .sectorHead{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
        .sectorTitle{opacity:.85;letter-spacing:.22em;font-size:12px;font-weight:900;}
        .diamond{display:inline-block;width:8px;height:8px;background:var(--cyan);transform:rotate(45deg);margin-right:10px;border-radius:2px;box-shadow:0 0 16px rgba(0,255,255,.25);}
        .sectorCoords{opacity:.55;letter-spacing:.18em;font-size:12px;}
        .sectorQuote{display:flex;gap:12px;align-items:center;margin:14px 0 10px;}
        .quoteBar{width:4px;height:34px;background:var(--violet);border-radius:999px;box-shadow:0 0 18px rgba(160,110,255,.2);}
        .quoteText{opacity:.7;font-style:italic;}
        .metricRow{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px;}
        .metricCard{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.24);}
        .metricLabel{opacity:.65;letter-spacing:.22em;font-size:12px;}
        .metricRight{float:right;margin-top:-16px;}
        .zenith{padding-top:6px;}
        .zenHead{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
        .zenLegend{opacity:.7;letter-spacing:.18em;font-size:12px;}
        .zenChart{position:relative;height:260px;border-radius:18px;margin-top:12px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);}
        .zenGrid{position:absolute;inset:0;background:
          linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
          background-size:32px 32px;opacity:.35;}
        .zenLine{position:absolute;left:8%;right:8%;top:28%;height:3px;border-radius:999px;}
        .zenLine.violet{background:rgba(160,110,255,.75);box-shadow:0 0 18px rgba(160,110,255,.14);transform:skewX(-10deg);top:30%;}
        .zenLine.cyan{background:rgba(0,255,255,.7);box-shadow:0 0 18px rgba(0,255,255,.12);top:44%;}
        .zenLine.cyan.dashed{mask:linear-gradient(90deg,#000 60%,transparent 0);mask-size:18px 100%;}
        .zenAxis{position:absolute;left:0;right:0;bottom:10px;text-align:center;opacity:.55;letter-spacing:.18em;font-size:11px;}
        .zenFooter{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px;}
        .zenTile{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.24);text-align:center;}
        .quickActions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
        .chip{padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.28);font-size:12px;letter-spacing:.18em}
        .chip.cyan{border-color:rgba(0,255,255,.18);color:rgba(0,255,255,.85);}
        .chip.violet{border-color:rgba(160,110,255,.18);color:rgba(160,110,255,.85);}
        .chip.neutral{opacity:.8;}
        @media (max-width: 820px){
          .heroStats{grid-template-columns:1fr;}
          .zenFooter{grid-template-columns:1fr;}
          .twoCol{grid-template-columns:1fr;}
        }
      `}</style>
    </div>
  );
}
