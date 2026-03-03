import React from "react";

type FeedItem = {
  operator: string;
  location: string;
  title: string;
  utc: string;
  mode: "VISUAL" | "RADIO";
  snr: string;
  hardware: string;
  peerReviews: number;
  oiGenerated: number;
  status: "PENDING" | "VERIFIED";
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}

function FeedCard({ item }: { item: FeedItem }) {
  const verified = item.status === "VERIFIED";
  return (
    <div className="feedCard">
      <div className="feedTop">
        <div className={`avatar ${verified ? "ok" : "warn"}`} />
        <div className="feedIdentity">
          <div className="feedUser">{item.operator}</div>
          <div className="mono feedLoc">{item.location}</div>
        </div>

        <div className="feedRight">
          <Badge>{item.mode}</Badge>
          <div className="mono snr">
            SNR: <span style={{ color: "var(--cyan)" }}>{item.snr}</span>
          </div>
        </div>
      </div>

      <div className="feedTitleRow">
        <div className="feedTitle">{item.title}</div>
        {verified ? <span className="check">✓</span> : null}
      </div>
      <div className="mono feedUtc">{item.utc}</div>

      <div className="frame">
        <div className="frameInner" />
        <div className="mono frameTag">ENCRYPTED_FRAME_DATA</div>
      </div>

      <div className="hardware">
        <div className="mono hwLabel">HARDWARE STACK</div>
        <div className="hwValue">{item.hardware}</div>
      </div>

      <div className="metaRow mono">
        <div>PEER_REVIEWS: {item.peerReviews}</div>
        <div>
          OI_GENERATED: <span style={{ color: "var(--cyan)" }}>+{item.oiGenerated}</span>
        </div>
      </div>

      <div className="statusRow mono">
        STATUS:&nbsp;
        <span style={{ color: verified ? "#41d38a" : "#e4b73a" }}>{item.status}</span>
      </div>

      <div className="footerPill mono">VALIDATOR DR: 1.3x</div>
    </div>
  );
}

export default function TelemetryPage() {
  const items: FeedItem[] = [
    {
      operator: "NovaWatcher",
      location: "LONDON, UK",
      title: "Messier 31",
      utc: "2024-05-20 22:15 UTC",
      mode: "VISUAL",
      snr: "25.6 dB",
      hardware: `Orion 8" Astrograph, ZWO ASI294MC Pro`,
      peerReviews: 0,
      oiGenerated: 450,
      status: "VERIFIED",
    },
    {
      operator: "SignalHunter",
      location: "TOKYO, JP",
      title: "Solar Burst A1",
      utc: "2024-05-20 19:42 UTC",
      mode: "RADIO",
      snr: "17.0 dB",
      hardware: "Custom 1.4m Dish, RTL-SDR, GNU Radio",
      peerReviews: 1,
      oiGenerated: 310,
      status: "PENDING",
    },
  ];

  return (
    <div className="page">
      <div className="card">
        <div className="mono kicker">COMMUNITY TELEMETRY FEED</div>
        <div className="h2">Obfuscated Data Stream v4.2</div>
        <div className="hr" />

        <div className="feedStack">
          {items.map((it) => (
            <FeedCard key={it.operator + it.title} item={it} />
          ))}
        </div>
      </div>

      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .feedStack{display:flex;flex-direction:column;gap:14px;margin-top:12px;}
        .feedCard{padding:18px;border-radius:22px;border:1px solid rgba(0,255,255,.18);background:rgba(10,16,28,.22);position:relative;}
        .feedTop{display:flex;gap:12px;align-items:center;}
        .avatar{width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);position:relative;}
        .avatar.ok{box-shadow:0 0 22px rgba(0,255,255,.10);border-color:rgba(0,255,255,.18);}
        .avatar.warn{box-shadow:0 0 22px rgba(160,110,255,.08);border-color:rgba(160,110,255,.18);}
        .feedIdentity{flex:1;min-width:0;}
        .feedUser{font-weight:900;}
        .feedLoc{opacity:.55;letter-spacing:.22em;font-size:12px;margin-top:2px;}
        .feedRight{display:flex;flex-direction:column;align-items:flex-end;gap:8px;}
        .badge{padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:rgba(10,16,28,.25);letter-spacing:.18em;font-size:12px;opacity:.9;}
        .snr{opacity:.8;letter-spacing:.18em;font-size:12px;}
        .feedTitleRow{display:flex;align-items:center;gap:10px;margin-top:16px;}
        .feedTitle{font-size:26px;font-weight:900;}
        .check{width:22px;height:22px;border-radius:999px;border:2px solid rgba(0,255,255,.5);display:grid;place-items:center;color:rgba(0,255,255,.9);font-weight:900;}
        .feedUtc{opacity:.55;letter-spacing:.18em;margin-top:4px;}
        .frame{margin-top:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);height:220px;position:relative;overflow:hidden;}
        .frameInner{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%, rgba(160,110,255,.16), transparent 55%);}
        .frameTag{position:absolute;left:14px;bottom:12px;opacity:.35;letter-spacing:.22em;font-size:11px;}
        .hardware{margin-top:14px;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.22);}
        .hwLabel{opacity:.6;letter-spacing:.22em;font-size:12px;margin-bottom:6px;}
        .hwValue{opacity:.85;}
        .metaRow{display:flex;justify-content:space-between;gap:10px;margin-top:12px;opacity:.7;letter-spacing:.18em;font-size:12px;flex-wrap:wrap;}
        .statusRow{margin-top:10px;opacity:.75;letter-spacing:.22em;}
        .footerPill{position:absolute;left:16px;bottom:16px;transform:translateY(100%);margin-top:14px;display:inline-block;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.28);opacity:.8;}
      `}</style>
    </div>
  );
}
