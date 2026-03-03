import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";

import Home from "../pages/Home";
import Globe from "../pages/Globe";
import Telemetry from "../pages/Telemetry";
import Submit from "../pages/Submit";
import Leaderboard from "../pages/Leaderboard";
import Collective from "../pages/Collective";
import Profile from "../pages/Profile";

// ✅ Auth is a named export in your file
import { Auth } from "../pages/Auth";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/globe" element={<Globe />} />
          <Route path="/telemetry" element={<Telemetry />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/collective" element={<Collective />} />
          <Route path="/profile" element={<Profile />} />

          {/* ✅ Auth route */}
          <Route path="/auth" element={<Auth />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
