import { Outlet, useLocation } from "react-router-dom";

const titleMap: Record<string, { kicker: string; sub: string }> = {
  "/": { kicker: "Helvarix Global Array", sub: "Operator dashboard • campaigns • stats" },
  "/globe": { kicker: "Helvarix Node Globe", sub: "Network visualization • local sector analysis" },
  "/telemetry": { kicker: "Telemetry Feed", sub: "Global verified feed • your captures" },
  "/submit": { kicker: "Submission Console", sub: "Visual • spectral • radio logging" },
  "/leaderboard": { kicker: "Global Rankings", sub: "Cumulative contribution standings" },
  "/collective": { kicker: "Helvarix Research Collective", sub: "Teams • advanced tools • special campaigns" },
  "/profile": { kicker: "Profile / Settings", sub: "Identity • account • subscription" }
};

export function Shell() {
  const loc = useLocation();
  const meta = titleMap[loc.pathname] ?? { kicker: "Helvarix", sub: "" };

  return (
    <>
      <div className="hudTop">
        <div className="hudTopInner">
          <div className="brand">
            <div className="brandTop">{meta.kicker}</div>
            <div className="brandBottom">{meta.sub}</div>
          </div>
          <div className="chip">BETA • ONLINE</div>
        </div>
      </div>

      <div className="container">
        <Outlet />
      </div>
    </>
  );
}
