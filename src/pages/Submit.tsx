import { UiCard } from "../components/UiCard";

export function Submit() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Data Logging Protocol" subtitle="Visual / Spectral / Radio submissions">
        <div style={{ color: "rgba(255,255,255,0.65)" }}>
          Beta placeholder. Next step: build the form and upload to Supabase Storage.
        </div>
      </UiCard>
    </div>
  );
}
