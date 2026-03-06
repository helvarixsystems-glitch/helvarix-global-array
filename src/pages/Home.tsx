import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

/* ------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------ */

type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL";

type CampaignRow = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string | null;
  end_at: string;
};

type ProfileRow = {
  id: string;
  callsign: string | null;
  role: string | null;
  observation_index: number | null;
  campaign_impact: number | null;
  streak_days: number | null;
  lat: number | null;
  lon: number | null;
};

type ObservationRow = {
  id: string;
  user_id: string;
  created_at: string;
  mode: string | null;
  target: string | null;
  tags: string[] | null;
};

type CampaignVM = {
  key: string;
  cadence: CampaignCadence;
  title: string;
  desc: string;
  endsIn: string;
  progress: number;
  accent: "cyan" | "violet";
};

/* ------------------------------------------------ */
/* HELPERS */
/* ------------------------------------------------ */

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function fmtEndsIn(endIso: string) {
  const end = new Date(endIso).getTime();
  const diff = end - Date.now();

  if (diff <= 0) return "ENDED";

  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days >= 1) return `ENDS IN ${days}D`;
  if (hrs >= 1) return `ENDS IN ${hrs}H`;

  return `ENDS IN ${mins}M`;
}

/* ------------------------------------------------ */
/* CACHE */
/* ------------------------------------------------ */

const cache = new Map<string, any>();

async function cachedQuery<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key);
  const data = await fn();
  cache.set(key, data);
  return data;
}

/* ------------------------------------------------ */
/* COMPONENT */
/* ------------------------------------------------ */

export default function Home() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignProgress, setCampaignProgress] = useState<Record<string, number>>(
    {}
  );

  const [recentObs, setRecentObs] = useState<ObservationRow[]>([]);
  const [userSubmissions, setUserSubmissions] = useState<number>(0);

  const realtimeRef = useRef<any>(null);

  /* ------------------------------------------------ */
  /* BOOTSTRAP */
  /* ------------------------------------------------ */

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;

      if (!alive) return;

      setSessionUserId(uid);

      const tasks: Promise<any>[] = [
        loadRecent(),
        loadCampaignProgress(uid),
      ];

      if (uid) {
        tasks.push(loadProfile(uid), loadUserSubmissionCount(uid));
      }

      await Promise.all(tasks);

      if (!alive) return;
      setLoading(false);
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------ */
  /* REALTIME */
  /* ------------------------------------------------ */

  useEffect(() => {
    const channel = supabase
      .channel("observations_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "observations" },
        (payload) => {
          const row = payload.new as ObservationRow;

          setRecentObs((prev) => {
            const next = [row, ...prev];
            return next.slice(0, 12);
          });
        }
      )
      .subscribe();

    realtimeRef.current = channel;

   return () => {
  channel.unsubscribe();
};
  }, []);

  /* ------------------------------------------------ */
  /* LOADERS */
  /* ------------------------------------------------ */

  async function loadProfile(uid: string) {
    const data = await cachedQuery(`profile-${uid}`, async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id,callsign,role,observation_index,campaign_impact,streak_days,lat,lon"
        )
        .eq("id", uid)
        .maybeSingle();

      return data as ProfileRow | null;
    });

    setProfile(data);
  }

  async function loadRecent() {
    const data = await cachedQuery("recent-observations", async () => {
      const { data } = await supabase
        .from("observations")
        .select("id,user_id,created_at,mode,target,tags")
        .order("created_at", { ascending: false })
        .limit(12);

      return (data ?? []) as ObservationRow[];
    });

    setRecentObs(data);
  }

  async function loadUserSubmissionCount(uid: string) {
    const { count } = await supabase
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);

    setUserSubmissions(count ?? 0);
  }

  /* ------------------------------------------------ */
  /* CAMPAIGN PROGRESS (RPC) */
  /* ------------------------------------------------ */

  async function loadCampaignProgress(uid: string | null) {
    if (!uid) return;

    const { data, error } = await supabase.rpc(
      "get_home_campaign_progress",
      { user_id: uid }
    );

    if (error) {
      console.error(error);
      return;
    }

    const progressMap: Record<string, number> = {};
    const campaignRows: CampaignRow[] = [];

    for (const row of data ?? []) {
      progressMap[row.id] = clamp01(row.progress ?? 0);

      campaignRows.push({
        id: row.id,
        cadence: row.cadence,
        title: row.title,
        description: row.description,
        end_at: row.end_at,
      });
    }

    setCampaignProgress(progressMap);
    setCampaigns(campaignRows);
  }

  /* ------------------------------------------------ */
  /* VIEW MODEL */
  /* ------------------------------------------------ */

  const campaignsSorted = useMemo<CampaignVM[]>(() => {
    const map = (c: CampaignRow): CampaignVM => ({
      key: c.id,
      cadence: c.cadence,
      title: c.title,
      desc: c.description ?? "",
      endsIn: fmtEndsIn(c.end_at),
      progress: campaignProgress[c.id] ?? 0,
      accent: c.cadence === "WEEKLY" ? "violet" : "cyan",
    });

    return campaigns.map(map);
  }, [campaigns, campaignProgress]);

  const userCallsign = profile?.callsign ?? "UNASSIGNED";
  const userRole = profile?.role ?? "OBSERVER";

  const obsIndex = profile?.observation_index ?? 0;
  const impact = profile?.campaign_impact ?? 0;
  const streak = profile?.streak_days ?? 0;

  /* ------------------------------------------------ */
  /* UI */
  /* ------------------------------------------------ */

  return (
    <div className="pageWrap">

      <div className="container">

        {/* HEADER */}

        <div className="topRow">

          <div className="brand">
            <div className="brandMark" />
            <div className="brandText">
              <div className="h1">HELVARIX GLOBAL ARRAY</div>
              <div className="mono sub">
                Astronomical observation pipeline
              </div>
            </div>
          </div>

          <div className="actions">
            <button className="btn primary" onClick={() => nav("/submit")}>
              Submit Observation
            </button>

            <button className="btn" onClick={() => nav("/guild")}>
              Research Guild
            </button>

            <button className="btn" onClick={() => nav("/campaigns")}>
              Campaigns
            </button>
          </div>

        </div>

        {/* GRID */}

        <div className="grid">

          {/* LEFT PANEL */}

          <div className="card">

            <div className="cardTitle">
              <div>
                <div className="mono kicker">OPERATOR</div>
                <div className="h2">{userCallsign}</div>
              </div>

              <span className="chip cyan">{userRole}</span>
            </div>

            <div className="statsRow">

              <div className="statTile">
                <div className="mono statLabel">Observation Index</div>
                <div className="statValue">{obsIndex}</div>
              </div>

              <div className="statTile">
                <div className="mono statLabel">Campaign Impact</div>
                <div className="statValue">{impact}</div>
              </div>

              <div className="statTile">
                <div className="mono statLabel">Streak (Days)</div>
                <div className="statValue">{streak}</div>
              </div>

            </div>

            {/* CAMPAIGNS */}

            <div className="sectionTitle">

              <span className="dot" />

              <div>
                <div className="h1">ACTIVE CAMPAIGNS</div>
                <div className="mono sub">
                  Daily • weekly • global objectives
                </div>
              </div>

            </div>

            <div className="campaignList">

              {campaignsSorted.map((c) => (

                <div className="campaignItem" key={c.key}>

                  <div className="campaignHead">

                    <div>

                      <div className="campaignTitle">
                        {c.title}
                      </div>

                      <div className="campaignDesc">
                        {c.desc}
                      </div>

                    </div>

                    <span className={`chip ${c.accent}`}>
                      {c.endsIn}
                    </span>

                  </div>

                  <div className="progressWrap">

                    <div
                      className="progressFill"
                      style={{
                        width: `${c.progress * 100}%`,
                      }}
                    />

                  </div>

                </div>

              ))}

            </div>

          </div>

          {/* RIGHT PANEL */}

          <div className="card">

            <div className="cardTitle">

              <div>
                <div className="mono kicker">ACTIVITY</div>
                <div className="h2">Recent Observations</div>
              </div>

              <span className="chip violet">
                {userSubmissions} Submissions
              </span>

            </div>

            {loading && (
              <div className="loading">
                Synchronizing…
              </div>
            )}

            <div className="recentGrid">

              {recentObs.map((o) => (

                <div
                  className="recentCard"
                  key={o.id}
                  onClick={() => nav(`/observation/${o.id}`)}
                >

                  <div className="mono recentMeta">
                    {new Date(o.created_at).toLocaleString()}
                  </div>

                  <div className="recentTitle">
                    {o.target ?? "UNSPECIFIED TARGET"}
                  </div>

                  <div className="recentTags">

                    <span className="chip cyan">
                      {(o.mode ?? "UNKNOWN").toUpperCase()}
                    </span>

                    {(o.tags ?? []).slice(0, 3).map((t) => (
                      <span className="chip neutral" key={t}>
                        {t}
                      </span>
                    ))}

                  </div>

                </div>

              ))}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
