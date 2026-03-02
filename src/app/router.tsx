import { createBrowserRouter } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Home } from "../pages/Home";
import { Globe } from "../pages/Globe";
import { Telemetry } from "../pages/Telemetry";
import { Submit } from "../pages/Submit";
import { Leaderboard } from "../pages/Leaderboard";
import { Collective } from "../pages/Collective";
import { Profile } from "../pages/Profile";
import { Auth } from "../pages/Auth";
import { Protected } from "../components/Protected";

export const router = createBrowserRouter([
  { path: "/auth", element: <Auth /> },
  {
    path: "/",
    element: (
      <Protected>
        <Shell />
      </Protected>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: "globe", element: <Globe /> },
      { path: "telemetry", element: <Telemetry /> },
      { path: "submit", element: <Submit /> },
      { path: "leaderboard", element: <Leaderboard /> },
      { path: "collective", element: <Collective /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);
