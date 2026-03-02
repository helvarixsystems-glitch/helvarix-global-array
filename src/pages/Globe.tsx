import { UiCard } from "../components/UiCard";

export function Globe() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Node Globe" subtitle="3D globe of active nodes + local metrics + recommended targets">
        <div style={{ color: "rgba(255,255,255,0.65)" }}>
          Beta placeholder. Next step: add a Three.js globe + fetch nodes from Supabase.
        </div>
      </UiCard>
    </div>
  );
}
