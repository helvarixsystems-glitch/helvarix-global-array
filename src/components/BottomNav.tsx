import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/globe", label: "Globe", icon: "◍" },
  { to: "/telemetry", label: "Telemetry", icon: "◎" },
  { to: "/submit", label: "Submit", icon: "⎘" },
  { to: "/leaderboard", label: "Ranks", icon: "✦" },
  { to: "/collective", label: "Collective", icon: "⟡" },
  { to: "/profile", label: "Profile", icon: "⚙" }
];

export function BottomNav() {
  return (
    <div className="navWrap">
      <div className="nav">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span className="navIcon">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
