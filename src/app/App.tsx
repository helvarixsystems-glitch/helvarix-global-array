import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";

// IMPORTANT: these imports match your actual filenames in src/pages/
import Home from "../pages/Home";
import Globe from "../pages/Globe";
import Telemetry from "../pages/Telemetry";
import Submit from "../pages/Submit";
import Leaderboard from "../pages/Leaderboard";
import Collective from "../pages/Collective";
import Profile from "../pages/Profile";
import Auth from "../pages/Auth";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          {/* Main app pages */}
          <Route path="/" element={<Home />} />
          <Route path="/globe" element={<Globe />} />
          <Route path="/telemetry" element={<Telemetry />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/collective" element={<Collective />} />
          <Route path="/profile" element={<Profile />} />

          {/* Optional auth route (kept since you have Auth.tsx) */}
          <Route path="/auth" element={<Auth />} />

          {/* Safety: unknown routes go home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
