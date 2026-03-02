import React, { useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";

// import your existing pages/components
// import HomePage from "./pages/HomePage";
// import SubmitPage from "./pages/SubmitPage";
// etc.

export default function App() {
  const [tab, setTab] = useState<"home" | "map" | "teams" | "submit" | "rankings" | "profile">("home");

  const content = useMemo(() => {
    switch (tab) {
      case "home":
        return <div className="card">
          <div className="cardTitle">
            <div>
              <div className="kicker mono">Active Campaigns</div>
              <div className="h2">Operations Feed</div>
            </div>
            <span className="badge cyan">Daily</span>
          </div>
          <div className="hr" />
          {/* Replace this block with your real Home component */}
          <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            Drop your existing Home/Campaign component here.
          </div>
        </div>;

      case "rankings":
        return <div className="card">
          <div className="h1">GLOBAL SECTOR RANKINGS</div>
          <div className="hr" />
          {/* Replace with your real rankings list */}
          <div className="card dim" style={{ marginTop: 12 }}>
            <div className="cardTitle">
              <div className="mono" style={{ color: "var(--cyan)", fontWeight: 800 }}>#01</div>
              <div style={{ flex: 1, paddingLeft: 14 }}>
                <div style={{ fontWeight: 800 }}>T. Kepler</div>
                <div className="mono" style={{ color: "var(--muted)" }}>Array Vanguard • EU-NORTH</div>
              </div>
              <div className="mono" style={{ color: "var(--cyan)", fontWeight: 800, fontSize: 18 }}>1,240,500</div>
            </div>
          </div>
        </div>;

      default:
        return <div className="card">
          <div className="kicker mono">Module</div>
          <div className="h2">{tab.toUpperCase()}</div>
          <div className="hr" />
          <div style={{ color: "var(--muted)" }}>Drop your existing page component here.</div>
        </div>;
    }
  }, [tab]);

  return (
    <AppShell active={tab} onChange={setTab}>
      {content}
    </AppShell>
  );
}
