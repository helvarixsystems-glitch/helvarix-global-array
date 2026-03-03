import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";

// Import your real pages (create these files if they don't exist yet)
import HomePage from "../pages/HomePage";
import GlobePage from "../pages/GlobePage";
import TelemetryPage from "../pages/TelemetryPage";
import SubmitPage from "../pages/SubmitPage";
import LeaderboardPage from "../pages/LeaderboardPage";
import CollectivePage from "../pages/CollectivePage";
import ProfilePage from "../pages/ProfilePage";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/globe" element={<GlobePage />} />
          <Route path="/telemetry" element={<TelemetryPage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/collective" element={<CollectivePage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* fallback */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
