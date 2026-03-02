import { UiCard } from "../components/UiCard";

export function Telemetry() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Community Telemetry Feed" subtitle="Global feed (verified objects)">
        <div style={{ color: "rgba(255,255,255,0.65)" }}>Beta placeholder.</div>
      </UiCard>

      <UiCard title="My Telemetry" subtitle="Your personal captures">
        <div style={{ color: "rgba(255,255,255,0.65)" }}>Beta placeholder.</div>
      </UiCard>
    </div>
  );
}
