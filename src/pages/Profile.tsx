import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { UiCard } from "../components/UiCard";
import { signOut } from "../lib/auth";
import { openCustomerPortal } from "../lib/stripe";

export function Profile() {
  const [callsign, setCallsign] = useState("Cmdr. Starlight");

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;

      const { data } = await supabase.from("profiles").select("callsign").eq("id", uid).single();
      if ((data as any)?.callsign) setCallsign((data as any).callsign);
    })();
  }, []);

  async function save() {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return;

    await supabase.from("profiles").update({ callsign }).eq("id", uid);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <UiCard title="Profile / Settings" subtitle="Customize identity • Manage subscription • Account">
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>Callsign / Designation</label>
          <input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(52,211,255,0.18)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
            }}
          />
          <button className="btn-primary" onClick={save}>Save</button>

          <button className="btn-primary" onClick={openCustomerPortal}>
            Manage Subscription
          </button>

          <button className="btn-primary" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </UiCard>
    </div>
  );
}
