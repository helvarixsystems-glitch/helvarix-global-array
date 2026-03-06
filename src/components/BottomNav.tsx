import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/globe", label: "Array", icon: "◎" },
  { to: "/telemetry", label: "Feed", icon: "◌" },
  { to: "/submit", label: "Submit", icon: "⎘" },
  { to: "/leaderboard", label: "Ranks", icon: "✦" },
  { to: "/collective", label: "Collective", icon: "⟡" },
  { to: "/profile", label: "Profile", icon: "⚙" },
];

export function BottomNav() {
  return (
    <div className="navWrap">
      <nav className="navBar">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
            <span className="navIcon">{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
