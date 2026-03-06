const feed = [
  {
    id: "1",
    operator: "NovaWatcher",
    target: "Messier 31",
    mode: "Visual",
    status: "Verified",
    time: "2026-03-05 22:15 UTC",
    hardware: 'Orion 8" Astrograph • ZWO ASI294MC Pro',
  },
  {
    id: "2",
    operator: "SignalHunter",
    target: "Solar burst A1",
    mode: "Radio",
    status: "Pending",
    time: "2026-03-05 19:42 UTC",
    hardware: "1.4m dish • RTL-SDR • GNU Radio",
  },
];

export default function Telemetry() {
  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">COMMUNITY FEED</div>
        <h1 className="pageTitle">Readable telemetry cards, not noise.</h1>
        <p className="pageText">
          The feed should emphasize target, observer, equipment, and verification state in a clean scan-friendly card stack.
        </p>
      </section>

      <div className="cardStack">
        {feed.map((item) => (
          <section key={item.id} className="panel telemetryCard">
            <div className="telemetryHead">
              <div>
                <div className="sectionKicker">{item.operator}</div>
                <h2 className="sectionTitle">{item.target}</h2>
              </div>
              <span className={`statusBadge ${item.status === "Verified" ? "good" : "warn"}`}>{item.status}</span>
            </div>
            <div className="dataList compactList">
              <div className="dataRow"><span>Mode</span><strong>{item.mode}</strong></div>
              <div className="dataRow"><span>Captured</span><strong>{item.time}</strong></div>
              <div className="dataRow"><span>Hardware</span><strong>{item.hardware}</strong></div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
