import { useEffect, useState } from "react";
import { openCustomerPortal } from "../lib/stripe";
import { supabase } from "../lib/supabaseClient";

type Profile = {
  callsign: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
};

export default function Profile() {
  const [profile, setProfile] = useState<Profile>({ callsign: "", role: "", city: "", country: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      const { data: row } = await supabase
        .from("profiles")
        .select("callsign,role,city,country")
        .eq("id", user.id)
        .maybeSingle();
      if (row) setProfile(row as Profile);
    });
  }, []);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Not signed in.");
      const { error: upsertError } = await supabase.from("profiles").upsert({ id: user.id, ...profile }, { onConflict: "id" });
      if (upsertError) throw upsertError;
      setMessage("Profile saved.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">ACCOUNT</div>
        <h1 className="pageTitle">User settings that matter.</h1>
        <p className="pageText">
          Keep profile editing practical: callsign, role, region, and billing controls should be visible without decorative overload.
        </p>
      </section>

      <section className="panel">
        <div className="formGrid">
          <div className="fieldGroup">
            <label className="fieldLabel">Callsign</label>
            <input className="input" value={profile.callsign ?? ""} onChange={(e) => setProfile({ ...profile, callsign: e.target.value })} />
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">Role</label>
            <input className="input" value={profile.role ?? ""} onChange={(e) => setProfile({ ...profile, role: e.target.value })} />
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">City</label>
            <input className="input" value={profile.city ?? ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">Country</label>
            <input className="input" value={profile.country ?? ""} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
          </div>
        </div>

        {message ? <div className="alert info">{message}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}

        <div className="buttonRow">
          <button className="primaryBtn" type="button" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
          <button
  className="ghostBtn"
  type="button"
  onClick={() =>
    openCustomerPortal().catch((err: Error) =>
      setError(err.message)
    )
  }
>
            Open billing portal
          </button>
        </div>
      </section>
    </div>
  );
}
