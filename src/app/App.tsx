import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";

function Placeholder({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="card">
      <div className="kicker mono">MODULE</div>
      <div className="h1">{title}</div>
      <div className="hr" />
      <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        {subtitle ?? "This page is wired correctly. Replace this with your real UI next."}
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="card">
      <div className="kicker mono">CAMPAIGN OPERATIONS</div>
      <div className="h1">Active Campaigns</div>
      <div style={{ color: "var(--muted)", marginTop: 6 }}>
        Daily • Weekly • Global
      </div>
      <div className="hr" />

      <div className="card dim" style={{ marginTop: 12 }}>
        <div className="kicker mono" style={{ color: "var(--violet)" }}>
          DAILY
        </div>
        <div className="h2" style={{ marginTop: 6 }}>
          Capture Jupiter
        </div>
        <div style={{ color: "var(--muted)", marginTop: 6 }}>
          Submit high-resolution planetary imaging. Prioritize sharpness + color balance.
        </div>
        <div className="hr" />
        <div className="progress">
          <div className="bar" style={{ width: "42%" }} />
        </div>
      </div>

      <div className="card dim" style={{ marginTop: 12 }}>
        <div className="kicker mono" style={{ color: "var(--violet)" }}>
          WEEKLY
        </div>
        <div className="h2" style={{ marginTop: 6 }}>
          Globular Clusters
        </div>
        <div style={{ color: "var(--muted)", marginTop: 6 }}>
          Image M13 or M92 with clean stars and stable tracking.
        </div>
        <div className="hr" />
        <div className="progress">
          <div className="bar" style={{ width: "38%" }} />
        </div>
      </div>

      <div className="card dim" style={{ marginTop: 12 }}>
        <div className="kicker mono" style={{ color: "var(--violet)" }}>
          GLOBAL
        </div>
        <div className="h2" style={{ marginTop: 6 }}>
          Hydrogen Line Mapping Event
        </div>
        <div style={{ color: "var(--muted)", marginTop: 6 }}>
          Coordinated 21cm capture across many nodes. (Beta event placeholder.)
        </div>
        <div className="hr" />
        <div className="progress">
          <div className="bar" style={{ width: "44%" }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/globe" element={<Placeholder title="Globe" />} />
          <Route path="/telemetry" element={<Placeholder title="Telemetry Feed" />} />
          <Route path="/submit" element={<Placeholder title="Data Logging Protocol" />} />
          <Route path="/leaderboard" element={<Placeholder title="Global Sector Rankings" />} />
          <Route path="/collective" element={<Placeholder title="Collective" />} />
          <Route path="/profile" element={<Placeholder title="Profile" />} />

          {/* Safety: if someone hits an unknown path */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
