export default function Globe() {
  const cards = [
    { label: "Active nodes", value: "4,129", note: "Observers currently online" },
    { label: "Live sessions", value: "892", note: "Submissions in progress" },
    { label: "Best window", value: "21:00–02:00", note: "Peak local collection band" },
    { label: "Verification queue", value: "126", note: "Items awaiting review" },
  ];

  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">NETWORK VIEW</div>
        <h1 className="pageTitle">Make the global array legible.</h1>
        <p className="pageText">
          This page should highlight network health, observer density, and collection timing without overwhelming the user.
        </p>
      </section>

      <section className="panel">
        <div className="fakeGlobe">
          <div className="fakeGlobeGrid" />
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="fakeGlobeDot"
              style={{ left: `${12 + ((i * 13) % 74)}%`, top: `${10 + ((i * 9) % 70)}%` }}
            />
          ))}
        </div>
      </section>

      <div className="gridFour">
        {cards.map((card) => (
          <section key={card.label} className="panel smallPanel">
            <div className="sectionKicker">{card.label}</div>
            <div className="bigStat">{card.value}</div>
            <div className="sectionText">{card.note}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
