import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type ProfileRow = {
  id: string;
  callsign: string | null;
  role: string | null;
  observation_index: number | null;
  campaign_impact: number | null;
  streak_days: number | null;
  city: string | null;
  country: string | null;
};

type ObservationRow = {
  id: string;
  created_at: string;
  target: string | null;
  mode: string | null;
  verification_status?: string | null;
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function Home() {
  const [email, setEmail] = useState<string>("observer@helvarix");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [recent, setRecent] = useState<ObservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;
        if (mounted) setEmail(user.email ?? "observer@helvarix");

        const [{ data: profileRow, error: profileError }, { data: obsRows, error: obsError }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,callsign,role,observation_index,campaign_impact,streak_days,city,country")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("observations")
            .select("id,created_at,target,mode,verification_status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (profileError) throw profileError;
        if (obsError) throw obsError;

        if (mounted) {
          setProfile((profileRow as ProfileRow | null) ?? null);
          setRecent((obsRows as ObservationRow[]) ?? []);
        }
      } catch (err: any) {
        if (mounted) setError(err?.message ?? "Unable to load your dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const callsign = profile?.callsign || email.split("@")[0] || "Observer";
  const role = profile?.role || "Array Observer";
  const location = [profile?.city, profile?.country].filter(Boolean).join(", ") || "Location not set";

  const stats = useMemo(
    () => [
      { label: "Observation Index", value: String(profile?.observation_index ?? 0) },
      { label: "Campaign Impact", value: String(profile?.campaign_impact ?? 0) },
      { label: "Streak", value: `${profile?.streak_days ?? 0} days` },
    ],
    [profile]
  );

  if (loading) {
    return (
      <div className="stateCard">
        <div className="stateTitle">Preparing your dashboard…</div>
        <div className="stateText">Loading profile details, submissions, and recent activity.</div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">PERSONALIZED DASHBOARD</div>
        <h1 className="pageTitle">Welcome back, {callsign}.</h1>
        <p className="pageText">
          Your home page should feel personal: your role, your progress, your recent submissions, and your next action should be visible immediately.
        </p>

        <div className="heroStats threeUp">
          {stats.map((stat) => (
            <div key={stat.label} className="metricCard">
              <div className="metricLabel">{stat.label}</div>
              <div className="metricValue">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="gridTwo">
        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">Operator profile</div>
              <h2 className="sectionTitle">Identity at a glance</h2>
            </div>
            <Link className="ghostBtn compactBtn" to="/profile">
              Edit profile
            </Link>
          </div>

          <div className="dataList">
            <div className="dataRow"><span>Email</span><strong>{email}</strong></div>
            <div className="dataRow"><span>Role</span><strong>{role}</strong></div>
            <div className="dataRow"><span>Region</span><strong>{location}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">Recommended next action</div>
              <h2 className="sectionTitle">Submit a new observation</h2>
            </div>
            <Link className="primaryBtn linkBtn" to="/submit">
              Open submit page
            </Link>
          </div>
          <p className="sectionText">
            The dashboard should direct the user toward the next valuable task instead of making them hunt through navigation.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Recent activity</div>
            <h2 className="sectionTitle">Your latest observations</h2>
          </div>
          <Link className="ghostBtn compactBtn" to="/telemetry">
            View feed
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="emptyState">No observations yet. Your first submission will show up here.</div>
        ) : (
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Captured</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td>{row.target || "Untitled observation"}</td>
                    <td>{row.mode || "—"}</td>
                    <td>{row.verification_status || "Pending"}</td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
