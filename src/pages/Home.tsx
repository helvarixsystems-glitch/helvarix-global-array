import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { UiCard } from "../components/UiCard";

type Profile = {
  callsign: string;
  observation_index: number;
  campaign_impact: number;
  streak_days: number;
  submissions_count: number;
  is_pro: boolean;
};

export function Home() {
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;

      const { data } = await supabase
        .from("profiles")
        .select("callsign,observation_index,campaign_impact,streak_days,submissions_count,is_pro")
        .eq("id", uid)
        .single();

      setP(data as any);
    })();
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.30em", color: "rgba(41,217,255,0.85)" }}>
          SPECTRE GLOBAL ARRAY
        </div>
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
          {p?.is_pro ? "PRO: ACTIVE" : "PRO: INACTIVE"}
        </div>
      </div>

      <UiCard
        title={p?.callsign ?? "Operator"}
        subtitle="Operator level + statistics"
        right={
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(41,217,255,0.9)", fontWeight: 800, fontSize: 18 }}>
              {p?.observation_index ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Observation Index</div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, 1fr)" }}>
          <Stat label="Impact" value={p?.campaign_impact ?? 0} />
          <Stat label="Streak" value={`${p?.streak_days ?? 0}d`} />
          <Stat label="Submissions" value={p?.submissions_count ?? 0} />
          <Stat label="Rank" value="—" />
        </div>
      </UiCard>

      <UiCard
        title="Active Campaigns"
        subtitle="Daily / Weekly / Global"
      >
        <div style={{ display: "grid", gap: 12 }}>
          <CampaignChip tag="DAILY" title="Capture Jupiter" desc="Submit high-resolution planetary imaging of the Jovian gas giant." />
          <CampaignChip tag="WEEKLY" title="Globular Clusters" desc="Identify and image Messier objects M13 or M92." />
          <CampaignChip tag="GLOBAL EVENT" title="Hydrogen Line Mapping Event" desc="Coordinated effort to map the H-I 21cm emission across the galactic plane." />
        </div>
      </UiCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="card" style={{ padding: 12, borderRadius: 14 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function CampaignChip({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.20em", color: "rgba(124,58,237,0.9)" }}>{tag}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>ENDS SOON</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>{title}</div>
      <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>{desc}</div>
      <div style={{ height: 10, marginTop: 12, borderRadius: 999, border: "1px solid rgba(52,211,255,0.14)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: "58%", background: "linear-gradient(90deg, rgba(41,217,255,0.85), rgba(124,58,237,0.65))" }} />
      </div>
    </div>
  );
}
