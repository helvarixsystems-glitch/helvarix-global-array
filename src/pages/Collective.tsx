import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { UiCard } from "../components/UiCard";
import { env } from "../lib/env";
import { startCheckout } from "../lib/stripe";

export function Collective() {
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;

      const { data } = await supabase.from("profiles").select("is_pro").eq("id", uid).single();
      setIsPro(Boolean((data as any)?.is_pro));
    })();
  }, []);

  if (isPro === null) return <div className="helper">Loading…</div>;

  if (!isPro) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <UiCard
          kicker="Helvarix Research Collective"
          title="Pro Access"
          subtitle="Teams • advanced tools • limited-entry campaigns"
          right={<div className="chip">LOCKED</div>}
        >
          <div className="sp" />
          <button className="btnPrimary" onClick={() => startCheckout(env.priceMonthly)}>
            Enroll • $15 / Month
          </button>
          <div className="sp" />
          <div className="helper">
            Pro unlocks: team coordination, advanced target planning, analysis tooling,
            and special campaigns (limited slots during beta).
          </div>
          <div className="sp" />
          <div className="warn">
            Yearly billing is disabled for now (coming later).
          </div>
        </UiCard>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard
        kicker="Helvarix Research Collective"
        title="Workspace Unlocked"
        subtitle="Teams • Tools • Special Campaigns"
        right={<div className="chip">PRO • ACTIVE</div>}
      >
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="campaign">
            <div className="tagRow">
              <div className="tag">TEAMS</div>
              <div className="deadline">BETA</div>
            </div>
            <div className="campaignTitle">Team Observatory</div>
            <div className="campaignDesc">
              Coordinate multi-site observations with shared objectives and private dashboards.
            </div>
            <div className="sp" />
            <button className="btnGhost">Initialize Team</button>
          </div>

          <div className="campaign">
            <div className="tagRow">
              <div className="tag">TOOLS</div>
              <div className="deadline">BETA</div>
            </div>
            <div className="campaignTitle">Advanced Planner</div>
            <div className="campaignDesc">
              Target optimization based on sky conditions + your equipment profile (placeholder).
            </div>
            <div className="sp" />
            <button className="btnGhost">Open Planner</button>
          </div>
        </div>

        <div className="sp" />
        <div className="campaign">
          <div className="tagRow">
            <div className="tag">SPECIAL CAMPAIGNS</div>
            <div className="deadline">LIMITED ENTRY</div>
          </div>
          <div className="campaignTitle">Limited-entry Missions</div>
          <div className="campaignDesc">
            Enforce the “50 spots” rule server-side when you build campaign joining logic.
          </div>
        </div>
      </UiCard>
    </div>
  );
}
