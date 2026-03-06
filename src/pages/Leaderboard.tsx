const rows = [
  ["#01", "T. Kepler", "Array Vanguard", "EU-North", "1,240,500"],
  ["#02", "H. Leavitt", "Master Observer", "NA-East", "984,320"],
  ["#03", "A. Sandage", "Master Observer", "Asia-Pacific", "850,110"],
  ["#04", "C. Shoemaker", "Network Specialist", "AU-West", "722,000"],
];

export default function Leaderboard() {
  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">COMMUNITY RANKING</div>
        <h1 className="pageTitle">Competitive, but readable.</h1>
        <p className="pageText">
          The leaderboard should feel motivating instead of cluttered, with clear role and region context for every ranking row.
        </p>
      </section>

      <section className="panel">
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Role</th>
                <th>Region</th>
                <th>Total OI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((value) => (
                    <td key={value}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
