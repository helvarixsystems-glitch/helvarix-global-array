import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { UiCard } from "../components/UiCard";

type Profile = {
  callsign: string | null;
  observation_index: number | null;
  campaign_impact: number | null;
  streak_days: number | null;
  submissions_count: number | null;
  is_pro: boolean | null;
};

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className="statLabel">{label}</div>
      <div className={"statValue " + (accent ? "statAccent" : "")}>{value}</div>
    </div>
  );
}

function Campaign({
  tag,
  title,
  desc,
  pct
}: {
  tag: string;
  title: string;
  desc: string;
  pct: number;
}) {
  return (
    <div className="campaign">
      <div className="tagRow">
        <div className="tag">{tag}</div>
        <div className="deadline">ACTIVE</div>
      </div>
      <div className="campaignTitle">{title}</div>
      <div className="campaignDesc">{desc}</div>
      <div className="progress" style={{ ["--w" as any]: `${pct}%` }}>
        <div />
      </div>
    </div>
  );
}

export function Home() {
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;

      const { data } = await supabase
        .from("profiles")
        .select("callsign,observation_index,campaign_impact,streak_days,submissions_count,is_pro")
        .eq("id", uid)
        .single();

      setP((data ?? null) as any);
    })();
  }, []);

  const callsign = p?.callsign ?? "Operator";
  const isPro = Boolean(p?.is_pro);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard
        kicker="Helvarix Global Array"
        title={callsign}
        subtitle="Operator level • performance • campaign readiness"
        right={<div className="chip">{isPro ? "PRO • ACTIVE" : "PRO • LOCKED"}</div>}
      >
        <div className="grid4">
          <Stat label="Observation Index" value={String(p?.observation_index ?? 0)} accent />
          <Stat label="Campaign Impact" value={String(p?.campaign_impact ?? 0)} />
          <Stat label="Submission Count" value={String(p?.submissions_count ?? 0)} />
          <Stat label="Streak" value={`${p?.streak_days ?? 0} days`} />
        </div>
      </UiCard>

      <UiCard
        kicker="Campaign Operations"
        title="Active Campaigns"
        subtitle="Daily • Weekly • Global"
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Campaign
            tag="DAILY"
            title="Capture Jupiter"
            desc="Submit high-resolution planetary imaging. Prioritize sharpness + color balance."
            pct={52}
          />
          <Campaign
            tag="WEEKLY"
            title="Globular Clusters"
            desc="Image M13 or M92 with clean stars and stable tracking."
            pct={34}
          />
          <Campaign
            tag="GLOBAL"
            title="Hydrogen Line Mapping Event"
            desc="Coordinated 21cm capture across many nodes. (Beta event placeholder.)"
            pct={78}
          />
        </div>
      </UiCard>
    </div>
  );
}
