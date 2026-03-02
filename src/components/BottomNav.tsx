import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home" },
  { to: "/globe", label: "Globe" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/submit", label: "Submit" },
  { to: "/leaderboard", label: "Ranks" },
  { to: "/collective", label: "Collective" },
  { to: "/profile", label: "Profile" },
];

export function BottomNav() {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "10px 10px 18px",
        background: "rgba(5,8,16,0.75)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(52,211,255,0.14)",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 8,
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              textDecoration: "none",
              color: isActive ? "white" : "rgba(255,255,255,0.60)",
              fontSize: 12,
              textAlign: "center",
              padding: "10px 6px",
              borderRadius: 12,
              border: isActive ? "1px solid rgba(124,58,237,0.55)" : "1px solid transparent",
              background: isActive ? "rgba(124,58,237,0.12)" : "transparent",
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
