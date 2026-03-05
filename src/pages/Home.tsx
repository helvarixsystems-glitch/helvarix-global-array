import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL";

type CampaignRow = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string | null;
  start_at: string; // timestamptz
  end_at: string; // timestamptz
  goal_user: number | null; // daily/weekly user goal
  goal_global: number | null; // global goal
  tags: string[] | null;
  is_active: boolean | null;
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
  image_url: string | null;
  ra: number | null;
  dec: number | null;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function fmtEndsIn(endIso: string) {
  const end = new Date(endIso).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return "ENDED";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `ENDS IN ${days}D`;
  if (hrs >= 1) return `ENDS IN ${hrs}H`;
  return `ENDS IN ${mins}M`;
}

function ProgressBar({ value }: { value: number }) {
  const pct = clamp01(value) * 100;
  return (
    <div className="progressWrap">
      <div
        className="progressFill"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, var(--cyan), var(--violet))`,
        }}
      />
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "cyan" | "violet" | "neutral" }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="statTile">
      <div className="mono statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

function emptyStr(v: string | null | undefined, fallback: string) {
  const s = (v ?? "").trim();
  return s ? s : fallback;
}

export default function HomePage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [recent, setRecent] = useState<ObservationRow[]>([]);
  const [netStats, setNetStats] = useState<{ submissions24h: number; contributors24h: number } | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [permMsg, setPermMsg] = useState<string | null>(null);

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // --- Load session + core data
  useEffect(() => {
    let alive = true;

    async function load() {
      setErr(null);
      setLoading(true);

      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (!alive) return;

      if (sessErr) {
        setErr(sessErr.message);
        setLoading(false);
        return;
      }

      const uid = sessData.session?.user?.id ?? null;
      setSessionUserId(uid);

      // If not signed in, we still show campaigns + network activity.
      const [campRes, recentRes, statsRes] = await Promise.all([
        loadCampaigns(),
        loadRecentObservations(),
        loadNetworkStats(),
      ]);

      if (!alive) return;

      if (!campRes.ok) setErr((e) => e ?? campRes.error);
      if (!recentRes.ok) setErr((e) => e ?? recentRes.error);
      if (!statsRes.ok) setErr((e) => e ?? statsRes.error);

      if (uid) {
        const profRes = await loadProfile(uid);
        if (!alive) return;
        if (!profRes.ok) setErr((e) => e ?? profRes.error);
      } else {
        setProfile(null);
      }

      setLoading(false);
    }

    load();

    const { data: authSub } = supabase.auth.onAuthStateChange((_evt, s) => {
      const uid = s?.user?.id ?? null;
      setSessionUserId(uid);
      // reload core data on sign in/out
      load();
    });

    return () => {
      alive = false;
      authSub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Realtime recent activity
  useEffect(() => {
    // tear down any existing channel
    realtimeRef.current?.unsubscribe();

    const ch = supabase
      .channel("hga_observations_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "observations" },
        (payload) => {
          const row = payload.new as ObservationRow;
          setRecent((prev) => [row, ...prev].slice(0, 20));
          // update counts lazily
          loadNetworkStats().then((r) => {
            if (r.ok) setNetStats(r.value);
          });
        }
      )
      .subscribe();

    realtimeRef.current = ch;

    return () => {
      ch.unsubscribe();
    };
  }, []);

  async function loadProfile(uid: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) return { ok: false, error: error.message };
    setProfile((data as ProfileRow) ?? null);
    return { ok: true };
  }

  async function loadCampaigns(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_active", true)
      .order("cadence", { ascending: true })
      .order("end_at", { ascending: true });

    if (error) return { ok: false, error: error.message };
    setCampaigns((data as CampaignRow[]) ?? []);
    return { ok: true };
  }

  async function loadRecentObservations(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await supabase
      .from("observations")
      .select("id,user_id,created_at,mode,target,tags,image_url,ra,dec")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { ok: false, error: error.message };
    setRecent((data as ObservationRow[]) ?? []);
    return { ok: true };
  }

  async function loadNetworkStats(): Promise<
    { ok: true; value: { submissions24h: number; contributors24h: number } } | { ok: false; error: string }
  > {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // count submissions in last 24h
    const subQ = supabase.from("observations").select("id", { count: "exact", head: true }).gte("created_at", since);

    // distinct contributors is trickier without RPC; we can approximate by pulling user_id list in a small window
    const contribQ = supabase
      .from("observations")
      .select("user_id")
      .gte("created_at", since)
      .limit(1000);

    const [{ count, error: e1 }, { data: contrib, error: e2 }] = await Promise.all([subQ, contribQ]);

    if (e1) return { ok: false, error: e1.message };
    if (e2) return { ok: false, error: e2.message };

    const unique = new Set((contrib ?? []).map((r) => (r as any).user_id)).size;
    const value = { submissions24h: count ?? 0, contributors24h: unique };
    setNetStats(value);
    return { ok: true, value };
  }

  async function requestGPS() {
    setPermMsg(null);

    if (!sessionUserId) {
      setPermMsg("Sign in first, then you can attach location to your profile.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setPermMsg("Geolocation isn’t available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lon = Number(pos.coords.longitude.toFixed(6));

        const { error } = await supabase.from("profiles").upsert({ id: sessionUserId, lat, lon }, { onConflict: "id" });
        if (error) {
          setPermMsg(`Could not save GPS: ${error.message}`);
          return;
        }
        setPermMsg("GPS saved to your profile.");
        loadProfile(sessionUserId);
      },
      (e) => {
        setPermMsg(e.message || "GPS permission denied.");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function requestCameraPermission() {
    setPermMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermMsg("Camera API isn’t available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // stop immediately: we only want permission granted
      stream.getTracks().forEach((t) => t.stop());
      setPermMsg("Camera permission granted. You can now upload/capture in Submit.");
    } catch (e: any) {
      setPermMsg(e?.message ?? "Camera permission denied.");
    }
  }

  // --- Campaign progress (real)
  const campaignModels = useMemo(() => {
    return campaigns.map((c) => ({
      ...c,
      endsIn: fmtEndsIn(c.end_at),
    }));
  }, [campaigns]);

  const [campaignProgress, setCampaignProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;

    async function computeProgress() {
      const uid = sessionUserId;

      const next: Record<string, number> = {};

      await Promise.all(
        campaigns.map(async (c) => {
          // Daily/Weekly = user progress, Global = everyone progress
          const isGlobal = c.cadence === "GLOBAL";

          const base = supabase
            .from("observations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", c.start_at)
            .lte("created_at", c.end_at);

          // Optional tag filtering
          const tags = (c.tags ?? []).filter(Boolean);
          let q = base;
          if (tags.length) {
            // requires tags column to be text[]; overlap operator is supported via `contains`/`overlaps` in postgrest:
            // overlaps = "ov" filter, but supabase-js supports .overlaps(column, array)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            q = q.overlaps("tags", tags);
          }

          if (!isGlobal && uid) q = q.eq("user_id", uid);

          const { count, error } = await q;
          if (error) {
            next[c.id] = 0;
            return;
          }

          const goal = isGlobal ? (c.goal_global ?? 100) : (c.goal_user ?? 1);
          const pct = goal > 0 ? (count ?? 0) / goal : 0;
          next[c.id] = clamp01(pct);
        })
      );

      if (!alive) return;
      setCampaignProgress(next);
    }

    if (campaigns.length) computeProgress();
    else setCampaignProgress({});

    return () => {
      alive = false;
    };
  }, [campaigns, sessionUserId]);

  // --- Sector analysis for the signed-in user
  const [sector, setSector] = useState<{
    total: number;
    byMode: { label: string; value: number }[];
    byRA: { label: string; value: number }[];
  } | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadSector() {
      if (!sessionUserId) {
        setSector(null);
        return;
      }

      // Pull a reasonable amount for local aggregation
      const { data, error } = await supabase
        .from("observations")
        .select("id,mode,ra,created_at")
        .eq("user_id", sessionUserId)
        .order("created_at", { ascending: false })
        .limit(400);

      if (!alive) return;

      if (error) {
        setSector(null);
        return;
      }

      const rows = (data ?? []) as Array<{ id: string; mode: string | null; ra: number | null; created_at: string }>;
      const total = rows.length;

      // mode distribution
      const modeMap = new Map<string, number>();
      for (const r of rows) {
        const m = (r.mode ?? "UNKNOWN").toUpperCase();
        modeMap.set(m, (modeMap.get(m) ?? 0) + 1);
      }
      const byMode = [...modeMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([label, value]) => ({ label, value }));

      // RA sectors: 6 bins (0-4h, 4-8h, ... 20-24h)
      // RA can be in degrees (0..360) or hours (0..24). We normalize:
      const raBins = new Array(6).fill(0);
      for (const r of rows) {
        if (r.ra == null) continue;
        const ra = Number(r.ra);
        const hours = ra > 24 ? (ra / 15) : ra; // deg->hours if looks like degrees
        const h = ((hours % 24) + 24) % 24;
        const idx = Math.min(5, Math.floor(h / 4));
        raBins[idx] += 1;
      }
      const byRA = raBins.map((v, i) => ({
        label: `${i * 4}-${i * 4 + 4}h`,
        value: v,
      }));

      setSector({ total, byMode, byRA });
    }

    loadSector();

    return () => {
      alive = false;
    };
  }, [sessionUserId]);

  const callsign = emptyStr(profile?.callsign, "Operator");
  const role = emptyStr(profile?.role, sessionUserId ? "CONTRIBUTOR" : "GUEST");
  const oi = profile?.observation_index ?? 0;
  const ci = profile?.campaign_impact ?? 0;
  const streak = profile?.streak_days ?? 0;

  return (
    <div className="page">
      {/* HERO */}
      <div className="card heroCard">
        <div className="heroTop">
          <div className="heroMark" aria-hidden>
            <div className="markGrid" />
            <div className="markGlyph" />
          </div>

          <div className="heroText">
            <div className="mono kickerRow">
              <span className="dot cyan" /> HELVARIX GLOBAL ARRAY
            </div>

            <div className="heroName">{callsign}</div>
            <div className="mono heroRole">{role}</div>

            <div className="heroMeta">
              <div className="metaPill mono">STREAK: {streak}D</div>
              <div className="metaPill mono">STATUS: {sessionUserId ? "AUTHENTICATED" : "SIGN IN REQUIRED"}</div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="heroStats">
          <StatTile label="OBSERVATION INDEX" value={oi.toLocaleString()} />
          <StatTile label="CAMPAIGN IMPACT" value={ci.toLocaleString()} />
        </div>

        <div className="divider" />

        <div style={{ display: "grid", gap: 10 }}>
          {!sessionUserId ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: "var(--muted)" }}>
                Sign in to submit observations, track your progress, and generate your personal sector analysis.
              </div>
              <button className="btnPrimary" onClick={() => nav("/auth")} type="button">
                Sign In / Create Account
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="mono" style={{ color: "var(--muted2)" }}>
                OPTIONAL PERMISSIONS (for better sector analysis + submissions)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button className="btnGhost" onClick={requestGPS} type="button">
                  Enable GPS
                </button>
                <button className="btnGhost" onClick={requestCameraPermission} type="button">
                  Enable Camera
                </button>
              </div>
              {permMsg && <div style={{ color: "rgba(41,217,255,0.86)" }}>{permMsg}</div>}
            </div>
          )}

          {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
          {loading && <div style={{ color: "var(--muted)" }}>Loading network telemetry…</div>}
        </div>
      </div>

      {/* CAMPAIGNS */}
      <div className="sectionTitle">
        <span className="dot cyan" />
        <div>
          <div className="h1">ACTIVE CAMPAIGNS</div>
          <div className="mono sub">Daily • Weekly • Global</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">CAMPAIGN OPERATIONS</div>
        <div className="h2">Live Campaigns</div>
        <div className="hr" />

        {campaignModels.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>
            No active campaigns yet. (Create rows in the <span className="mono">campaigns</span> table.)
          </div>
        ) : (
          <div className="stack">
            {campaignModels.map((c) => {
              const pct = campaignProgress[c.id] ?? 0;
              const isGlobal = c.cadence === "GLOBAL";
              return (
                <div key={c.id} className="campaignCard">
                  <div className="campaignTop">
                    <div className="mono campaignCadence" style={{ color: c.cadence === "WEEKLY" ? "var(--violet)" : "var(--cyan)" }}>
                      {c.cadence}
                    </div>
                    <div className="mono campaignEnds">{c.endsIn}</div>
                  </div>

                  <div className="campaignTitle">{c.title}</div>
                  <div className="campaignDesc">{c.description ?? ""}</div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {isGlobal ? <Chip tone="violet">GLOBAL POOL</Chip> : <Chip tone="cyan">INDIVIDUAL</Chip>}
                    {(c.tags ?? []).slice(0, 4).map((t) => (
                      <Chip key={t} tone="neutral">
                        {t}
                      </Chip>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "var(--muted2)" }}>
                      <span>PROGRESS</span>
                      <span>{Math.round(pct * 100)}%</span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NETWORK ACTIVITY */}
      <div className="sectionTitle" style={{ marginTop: 22 }}>
        <span className="dot violet" />
        <div>
          <div className="h1">NETWORK ACTIVITY</div>
          <div className="mono sub">Live submissions • contributors • telemetry</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">LIVE TELEMETRY</div>
        <div className="h2">Network Pulse</div>
        <div className="hr" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="statTile">
            <div className="mono statLabel">SUBMISSIONS (24H)</div>
            <div className="statValue">{(netStats?.submissions24h ?? 0).toLocaleString()}</div>
          </div>
          <div className="statTile">
            <div className="mono statLabel">CONTRIBUTORS (24H)</div>
            <div className="statValue">{(netStats?.contributors24h ?? 0).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }} className="hr" />

        <div className="mono" style={{ color: "var(--muted2)", marginBottom: 8 }}>
          RECENT OBSERVATIONS
        </div>

        {recent.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No observations yet. Your first submissions will appear here.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recent.map((r) => (
              <div key={r.id} className="campaignCard" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 800 }}>
                      {emptyStr(r.target, "Untitled Observation")}
                    </div>
                    <div className="mono" style={{ color: "var(--muted2)" }}>
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Chip tone="neutral">{(r.mode ?? "UNKNOWN").toUpperCase()}</Chip>
                    {r.image_url ? <Chip tone="cyan">IMAGE</Chip> : <Chip tone="violet">DATA</Chip>}
                  </div>
                </div>

                {(r.tags ?? []).length ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(r.tags ?? []).slice(0, 6).map((t) => (
                      <Chip key={t} tone="neutral">
                        {t}
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTOR ANALYSIS */}
      <div className="sectionTitle" style={{ marginTop: 22 }}>
        <span className="dot cyan" />
        <div>
          <div className="h1">SECTOR ANALYSIS</div>
          <div className="mono sub">Your personal observation footprint</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 40 }}>
        <div className="mono kicker">OPERATOR ANALYTICS</div>
        <div className="h2">Your Sector Summary</div>
        <div className="hr" />

        {!sessionUserId ? (
          <div style={{ color: "var(--muted)" }}>
            Sign in to generate your sector analysis.
          </div>
        ) : !sector ? (
          <div style={{ color: "var(--muted)" }}>
            No sector data yet. Once you submit observations (especially with RA/Dec), your sector map will populate.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="statTile">
              <div className="mono statLabel">OBSERVATIONS ANALYZED</div>
              <div className="statValue">{sector.total.toLocaleString()}</div>
            </div>

            <div>
              <div className="mono" style={{ color: "var(--muted2)", marginBottom: 8 }}>
                BY MODE
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {sector.byMode.map((m) => {
                  const pct = sector.total ? m.value / sector.total : 0;
                  return (
                    <div key={m.label}>
                      <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "var(--muted2)" }}>
                        <span>{m.label}</span>
                        <span>{Math.round(pct * 100)}%</span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mono" style={{ color: "var(--muted2)", marginBottom: 8 }}>
                RIGHT ASCENSION SECTORS (4H BINS)
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {sector.byRA.map((b) => {
                  const pct = sector.total ? b.value / sector.total : 0;
                  return (
                    <div key={b.label}>
                      <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "var(--muted2)" }}>
                        <span>{b.label}</span>
                        <span>{b.value.toLocaleString()}</span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.45 }}>
                Tip: your RA sectors become far more accurate if your submissions store RA/Dec metadata (or if you upload FITS and parse headers).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Optional: if your theme doesn’t already have danger, define it in CSS.
// This is only used if missing.
const _unused: CSSProperties = { color: "var(--danger)" };
