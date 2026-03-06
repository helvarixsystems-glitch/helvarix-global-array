import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Protected } from "../components/Protected";
import { Auth } from "../pages/Auth";
import Collective from "../pages/Collective";
import Globe from "../pages/Globe";
import Home from "../pages/Home";
import Leaderboard from "../pages/Leaderboard";
import Profile from "../pages/Profile";
import Submit from "../pages/Submit";
import Telemetry from "../pages/Telemetry";

function ProtectedPage({ children }: { children: JSX.Element }) {
  return <Protected>{children}</Protected>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedPage><Home /></ProtectedPage>} />
          <Route path="/globe" element={<ProtectedPage><Globe /></ProtectedPage>} />
          <Route path="/telemetry" element={<ProtectedPage><Telemetry /></ProtectedPage>} />
          <Route path="/submit" element={<ProtectedPage><Submit /></ProtectedPage>} />
          <Route path="/leaderboard" element={<ProtectedPage><Leaderboard /></ProtectedPage>} />
          <Route path="/collective" element={<ProtectedPage><Collective /></ProtectedPage>} />
          <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
