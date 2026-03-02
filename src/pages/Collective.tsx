import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { UiCard } from "../components/UiCard";
import { env } from "../lib/env";
import { startCheckout } from "../lib/stripe";

export function Collective() {
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;

      const { data } = await supabase.from("profiles").select("is_pro").eq("id", uid).single();
      setIsPro(Boolean((data as any)?.is_pro));
    })();
  }, []);

  if (isPro === null) return <div>Loading…</div>;

  if (!isPro) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <UiCard
          title="Spectre Pro Tier"
          subtitle="Advanced analytical precision, predictive simulation, and priority certification."
        >
          <div style={{ display: "grid", gap: 10 }}>
            <button className="btn-primary" onClick={() => startCheckout(env.priceMonthly)}>
              Enroll Monthly ($15)
            </button>
            <button className="btn-primary" onClick={() => startCheckout(env.priceAnnual)}>
              Enroll Annual ($150)
            </button>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Pro unlocks teams, advanced tools, and limited-entry campaigns (beta cap: 50 slots).
            </div>
          </div>
        </UiCard>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Helvarix Research Collective" subtitle="Teams • Advanced Tools • Special Campaigns">
        <div className="card" style={{ padding: 14, marginTop: 10 }}>
          <div style={{ fontWeight: 800 }}>Team Observatory</div>
          <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Coordinate multi-site observations with private dashboards.
          </div>
          <button className="btn-primary" style={{ marginTop: 12, width: "100%" }}>
            Initialize Team
          </button>
        </div>

        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>Limited Entry Campaigns</div>
          <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            These will be capped to 50 individuals/teams in beta.
          </div>
        </div>
      </UiCard>
    </div>
  );
}
