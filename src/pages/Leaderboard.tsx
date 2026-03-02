import { UiCard } from "../components/UiCard";

export function Leaderboard() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Global Sector Rankings" subtitle="Cumulative rank based on submissions & verification">
        <div style={{ color: "rgba(255,255,255,0.65)" }}>Beta placeholder.</div>
      </UiCard>
    </div>
  );
}
