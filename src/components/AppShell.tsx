import React from "react";

type TabId = "home" | "map" | "teams" | "submit" | "rankings" | "profile";

export function AppShell(props: {
  active: TabId;
  onChange: (t: TabId) => void;
  children: React.ReactNode;
}) {
  const { active, onChange, children } = props;

  return (
    <>
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <div className="name">HELVARIX GLOBAL ARRAY</div>
            <div className="sub mono">Operator Console • Secure Telemetry</div>
          </div>

          <div className="pillRow">
            <div className="pill">
              <div className="label">OI</div>
              <div className="val" style={{ color: "var(--cyan)" }}>24,500</div>
            </div>
            <div className="pill">
              <div className="label">CI</div>
              <div className="val" style={{ color: "var(--violet)" }}>1,200</div>
            </div>
          </div>
        </div>

        {children}
      </div>

      <nav className="bottomNav" aria-label="Primary">
        <div className="row">
          <button className={"navBtn " + (active === "home" ? "active" : "")} onClick={() => onChange("home")} title="Home">⌂</button>
          <button className={"navBtn " + (active === "map" ? "active" : "")} onClick={() => onChange("map")} title="Map">▦</button>
          <button className={"navBtn " + (active === "teams" ? "active" : "")} onClick={() => onChange("teams")} title="Teams">◌◌</button>
          <button className={"navBtn " + (active === "submit" ? "active" : "")} onClick={() => onChange("submit")} title="Submit">📷</button>
          <button className={"navBtn " + (active === "rankings" ? "active" : "")} onClick={() => onChange("rankings")} title="Rankings">🏆</button>
          <button className={"navBtn " + (active === "profile" ? "active" : "")} onClick={() => onChange("profile")} title="Profile">👤</button>
        </div>
      </nav>
    </>
  );
}
