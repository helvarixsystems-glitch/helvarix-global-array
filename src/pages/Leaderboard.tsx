import React from "react";

type Row = { rank: string; name: string; role: string; region: string; total: string };

const rows: Row[] = [
  { rank: "#01", name: "T. Kepler", role: "Array Vanguard", region: "EU-NORTH", total: "1,240,500" },
  { rank: "#02", name: "H. Leavitt", role: "Master Observer", region: "NA-EAST", total: "984,320" },
  { rank: "#03", name: "A. Sandage", role: "Master Observer", region: "ASIA-PAC", total: "850,110" },
  { rank: "#04", name: "C. Shoemaker", role: "Network Specialist", region: "AU-WEST", total: "722,000" },
  { rank: "#05", name: "Cmdr. Starlight", role: "Deep Space Contributor", region: "SELF-LINK", total: "24,500" },
];

export default function LeaderboardPage() {
  return (
    <div className="page">
      <div className="card">
        <div className="h1">GLOBAL SECTOR RANKINGS</div>
        <div className="hr" />

        <div className="rankStack">
          {rows.map((r) => (
            <div key={r.rank} className={`rankRow ${r.rank === "#05" ? "dim" : ""}`}>
              <div className="mono rankNum">{r.rank}</div>
              <div className="rankMain">
                <div className="rankName">{r.name}</div>
                <div className="mono rankSub">
                  {r.role} • {r.region}
                </div>
              </div>
              <div className="rankTotal">
                <div className="mono totalVal">{r.total}</div>
                <div className="mono totalLbl">TOTAL OI</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .rankStack{display:flex;flex-direction:column;gap:12px;margin-top:14px;}
        .rankRow{display:flex;align-items:center;gap:14px;padding:18px;border-radius:18px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);}
        .rankRow.dim{opacity:.6}
        .rankNum{color:var(--cyan);font-weight:900;letter-spacing:.18em;font-size:18px;min-width:56px;}
        .rankMain{flex:1;min-width:0;}
        .rankName{font-weight:900;font-size:22px;}
        .rankSub{opacity:.6;letter-spacing:.18em;font-size:12px;margin-top:4px;}
        .rankTotal{text-align:right;}
        .totalVal{color:var(--cyan);font-weight:900;font-size:22px;letter-spacing:.12em;}
        .totalLbl{opacity:.5;letter-spacing:.22em;font-size:12px;margin-top:4px;}
      `}</style>
    </div>
  );
}
