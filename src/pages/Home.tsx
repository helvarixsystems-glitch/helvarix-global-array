import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL";

type CampaignRow = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  goal_user: number | null;
  goal_global: number | null;
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
};

type EarthTelemetry = {
  lat: number;
  lon: number;
  elevM?: number | null;
  timeLocal: string;

  cloudCoverPct?: number;
  tempC?: number;
  pressureHPa?: number;
  windMS?: number;

  kp?: number | null;
  kpLabel?: "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "UNKNOWN";

  photonFluxStabilityPct?: number;

  sunAltNowDeg: number;
  skyState: "DAYLIGHT" | "CIVIL" | "NAUTICAL" | "ASTRONOMICAL" | "NIGHT";
  optimalCollectionStartLocal?: string | null;
  nightRemaining?: string | null;

  hours: string[];
  airmass: number[];
  seeingArcsec: number[];
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function ProgressBar({
  value,
  accent,
}: {
  value: number;
  accent: "cyan" | "violet" | "amber";
}) {
  const pct = clamp01(value) * 100;

  if (accent === "amber") {
    return (
      <div className="progressWrap">
        <div
          className="progressFill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #e4b73a, rgba(228,183,58,0.15))`,
          }}
        />
      </div>
    );
  }

  const from = accent === "cyan" ? "var(--cyan)" : "var(--violet)";
  const to = accent === "cyan" ? "var(--violet)" : "var(--cyan)";

  return (
    <div className="progressWrap">
      <div
        className="progressFill"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${from}, ${to})`,
        }}
      />
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "cyan" | "violet" | "neutral" | "amber";
}) {
  const cls = `chip ${tone}`;
  return <span className={cls}>{children}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="statTile">
      <div className="mono statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
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

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function toDeg(r: number) {
  return (r * 180) / Math.PI;
}
function wrap360(deg: number) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function solarAltitudeDeg(date: Date, latDeg: number, lonDeg: number) {
  const ms = date.getTime();
  const jd = ms / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  const L = wrap360(280.46 + 0.9856474 * n);
  const g = wrap360(357.528 + 0.9856003 * n);
  const lambda = wrap360(
    L + 1.915 * Math.sin(toRad(g)) + 0.02 * Math.sin(toRad(2 * g))
  );
  const eps = 23.439 - 0.0000004 * n;

  const sinDecl = Math.sin(toRad(eps)) * Math.sin(toRad(lambda));
  const decl = Math.asin(sinDecl);

  const GMST = wrap360(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * (n / 36525) * (n / 36525) -
      (n / 36525) * (n / 36525) * (n / 36525) / 38710000
  );

  const LST = wrap360(GMST + lonDeg);
  const ra = Math.atan2(
    Math.cos(toRad(eps)) * Math.sin(toRad(lambda)),
    Math.cos(toRad(lambda))
  );
  const raDeg = wrap360(toDeg(ra));
  const H = wrap360(LST - raDeg);

  const lat = toRad(latDeg);
  const alt = Math.asin(
    Math.sin(lat) * Math.sin(decl) +
      Math.cos(lat) * Math.cos(decl) * Math.cos(toRad(H))
  );
  return toDeg(alt);
}

function skyStateFromAlt(altDeg: number) {
  if (altDeg > 0) return "DAYLIGHT";
  if (altDeg > -6) return "CIVIL";
  if (altDeg > -12) return "NAUTICAL";
  if (altDeg > -18) return "ASTRONOMICAL";
  return "NIGHT";
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function fmtLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

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

  const [earth, setEarth] = useState<EarthTelemetry | null>(null);
  const [earthBusy, setEarthBusy] = useState(false);
  const [earthErr, setEarthErr] = useState<string | null>(null);

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const uid = data.session?.user?.id ?? null;
      setSessionUserId(uid);

      await Promise.all([loadCampaigns(), loadRecent()]);

      if (uid) {
        await Promise.all([loadProfile(uid), loadUserSubmissionCount(uid)]);
      }

      await loadEarthSector();

      if (!alive) return;
      setLoading(false);
    }

    boot();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("home_observations_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "observations" },
        (payload) => {
          const row = payload.new as ObservationRow;
          setRecentObs((prev) => [row, ...prev].slice(0, 12));
        }
      )
      .subscribe();

    realtimeRef.current = ch;
    return () => {
      ch.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,callsign,role,observation_index,campaign_impact,streak_days,lat,lon")
      .eq("id", uid)
      .maybeSingle();

    if (error) return;
    setProfile((data as ProfileRow) ?? null);
  }

  async function loadCampaigns() {
    const { data } = await supabase
      .from("campaigns")
      .select(
        "id,cadence,title,description,start_at,end_at,goal_user,goal_global,tags,is_active"
      )
      .order("start_at", { ascending: false });

    setCampaigns((data as CampaignRow[]) ?? []);
  }

  async function loadRecent() {
    const { data } = await supabase
      .from("observations")
      .select("id,user_id,created_at,mode,target,tags,image_url")
      .order("created_at", { ascending: false })
      .limit(12);

    setRecentObs((data as ObservationRow[]) ?? []);
  }

  async function loadUserSubmissionCount(uid: string) {
    const { count } = await supabase
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);

    setUserSubmissions(count ?? 0);
  }

  // Compute campaign progress (user vs goal)
  useEffect(() => {
    let alive = true;

    async function compute() {
      const uid = sessionUserId;
      if (!uid) return;

      const next: Record<string, number> = {};

      await Promise.all(
        campaigns.map(async (c) => {
          const start = new Date(c.start_at).toISOString();
          const end = new Date(c.end_at).toISOString();
          const { count } = await supabase
            .from("observations")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .gte("created_at", start)
            .lte("created_at", end);

          const goal =
            (c.cadence === "GLOBAL" ? c.goal_global : c.goal_user) ?? 0;
          next[c.id] = goal > 0 ? clamp01((count ?? 0) / goal) : 0;
        })
      );

      if (!alive) return;
      setCampaignProgress(next);
    }

    if (campaigns.length) compute();
    else setCampaignProgress({});

    return () => {
      alive = false;
    };
  }, [campaigns, sessionUserId]);

  async function loadEarthSector() {
    setEarthErr(null);
    setEarthBusy(true);

    try {
      // Resolve lat/lon:
      // 1) profile lat/lon
      // 2) browser geolocation (optional)
      let lat = profile?.lat ?? null;
      let lon = profile?.lon ?? null;

      if (lat == null || lon == null) {
        // Try browser geolocation (non-blocking if denied)
        await new Promise<void>((resolve) => {
          if (!navigator.geolocation) return resolve();
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude;
              lon = pos.coords.longitude;
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 6000 }
          );
        });
      }

      // Fallback (0,0) if still null
      if (lat == null) lat = 0;
      if (lon == null) lon = 0;

      const now = new Date();
      const altNow = solarAltitudeDeg(now, lat, lon);
      const skyState = skyStateFromAlt(altNow);

      // Basic heuristic windows (replace with real API values later)
      const optimalStart =
        skyState === "DAYLIGHT" ? null : now.toLocaleTimeString();
      const remaining = skyState === "NIGHT" ? "—" : null;

      const hours = Array.from({ length: 12 }).map((_, i) => {
        const d = new Date(now);
        d.setHours(now.getHours() + i);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      });

      const airmass = hours.map((_, i) => 1 + Math.abs(Math.sin(i / 3)) * 1.2);
      const seeing = hours.map((_, i) => 1.2 + Math.abs(Math.cos(i / 4)) * 1.0);

      const payload: EarthTelemetry = {
        lat,
        lon,
        elevM: null,
        timeLocal: now.toLocaleString(),
        cloudCoverPct: undefined,
        tempC: undefined,
        pressureHPa: undefined,
        windMS: undefined,
        kp: null,
        kpLabel: "UNKNOWN",
        photonFluxStabilityPct: undefined,
        sunAltNowDeg: round1(altNow),
        skyState,
        optimalCollectionStartLocal: optimalStart,
        nightRemaining: remaining,
        hours,
        airmass: airmass.map(round1),
        seeingArcsec: seeing.map(round1),
      };

      setEarth(payload);
    } catch (e: any) {
      setEarthErr(e?.message ?? "Failed to load earth sector telemetry.");
      setEarth(null);
    } finally {
      setEarthBusy(false);
    }
  }

  // ✅ FIX: flatten the arrays so this is CampaignVM[], not CampaignVM[][]
  type CampaignVM = {
    key: string;
    cadence: CampaignCadence;
    title: string;
    desc: string;
    endsIn: string;
    progress: number;
    accent: "cyan" | "violet";
  };

  const campaignsSorted = useMemo<CampaignVM[]>(() => {
    const daily = campaigns.filter((c) => c.cadence === "DAILY" && c.is_active);
    const weekly = campaigns.filter((c) => c.cadence === "WEEKLY" && c.is_active);
    const global = campaigns.filter((c) => c.cadence === "GLOBAL" && c.is_active);

    const map = (list: CampaignRow[], accent: "cyan" | "violet"): CampaignVM[] =>
      list.map((c) => ({
        key: c.id,
        cadence: c.cadence,
        title: c.title,
        desc: c.description ?? "",
        endsIn: fmtEndsIn(c.end_at),
        progress: campaignProgress[c.id] ?? 0,
        accent,
      }));

    return [...map(daily, "cyan"), ...map(weekly, "violet"), ...map(global, "cyan")];
  }, [campaigns, campaignProgress]);

  const sectorCoords = useMemo(() => {
    const lat = earth?.lat ?? profile?.lat;
    const lon = earth?.lon ?? profile?.lon;
    if (lat == null || lon == null) return "—";
    return fmtLatLon(lat, lon);
  }, [earth, profile]);

  const photonFlux = useMemo(() => {
    const v = earth?.photonFluxStabilityPct;
    if (v == null) return null;
    return Math.round(v);
  }, [earth]);

  const kpTone = useMemo(() => {
    const label = earth?.kpLabel ?? "UNKNOWN";
    if (label === "LOW") return "cyan";
    if (label === "MODERATE") return "violet";
    if (label === "HIGH" || label === "SEVERE") return "amber";
    return "neutral";
  }, [earth]);

  const userCallsign = profile?.callsign ?? "UNASSIGNED";
  const userRole = profile?.role ?? "OBSERVER";

  const obsIndex = profile?.observation_index ?? 0;
  const impact = profile?.campaign_impact ?? 0;
  const streak = profile?.streak_days ?? 0;

  const openSubmit = () => nav("/submit");
  const openGuild = () => nav("/guild");
  const openCampaigns = () => nav("/campaigns");

  return (
    <div className="pageWrap">
      <style>{`
        :root{
          --bg:#070915;
          --panel:rgba(10,14,28,0.68);
          --panel2:rgba(6,10,18,0.55);
          --stroke:rgba(255,255,255,0.10);
          --stroke2:rgba(255,255,255,0.06);
          --text:rgba(255,255,255,0.92);
          --muted:rgba(255,255,255,0.62);
          --muted2:rgba(255,255,255,0.42);
          --cyan:#38f2ff;
          --violet:#a78bfa;
          --amber:#e4b73a;
          --danger:#ff5f6d;
        }

        .pageWrap{
          min-height:100vh;
          color:var(--text);
          background:
            radial-gradient(1000px 600px at 20% -20%, rgba(56,242,255,0.12), transparent 55%),
            radial-gradient(900px 600px at 110% 30%, rgba(167,139,250,0.14), transparent 50%),
            radial-gradient(900px 700px at 40% 120%, rgba(56,242,255,0.06), transparent 55%),
            linear-gradient(180deg, #040513, #070915 55%, #040513);
          padding: 28px 18px 60px;
        }

        .container{
          max-width: 1150px;
          margin: 0 auto;
        }

        .mono{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .topRow{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
          margin-bottom: 18px;
        }

        .brand{
          display:flex;
          align-items:center;
          gap: 12px;
        }

        .brandMark{
          width: 38px;
          height: 38px;
          border-radius: 14px;
          background:
            radial-gradient(circle at 35% 35%, rgba(56,242,255,.45), transparent 55%),
            radial-gradient(circle at 65% 70%, rgba(167,139,250,.35), transparent 60%),
            rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 12px 45px rgba(0,0,0,0.45);
        }

        .brandText .h1{
          font-size: 18px;
          font-weight: 800;
          letter-spacing: .08em;
        }
        .brandText .sub{
          margin-top: 4px;
          font-size: 11px;
          color: var(--muted);
        }

        .actions{
          display:flex;
          gap: 10px;
          align-items:center;
          flex-wrap:wrap;
        }

        .btn{
          border:1px solid var(--stroke);
          background: rgba(255,255,255,0.03);
          color: var(--text);
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 700;
          letter-spacing: .04em;
          cursor:pointer;
          transition: transform .08s ease, background .2s ease, border-color .2s ease;
        }
        .btn:hover{
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.16);
        }
        .btn:active{ transform: translateY(1px); }

        .btn.primary{
          background: linear-gradient(90deg, rgba(56,242,255,0.18), rgba(167,139,250,0.18));
          border-color: rgba(56,242,255,0.26);
        }

        .grid{
          display:grid;
          grid-template-columns: 1.05fr 1fr;
          gap: 14px;
        }
        @media (max-width: 980px){
          .grid{ grid-template-columns: 1fr; }
        }

        .card{
          border-radius: 22px;
          background: var(--panel);
          border: 1px solid var(--stroke2);
          box-shadow: 0 18px 70px rgba(0,0,0,0.42);
          padding: 16px;
        }

        .cardTitle{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          margin-bottom: 12px;
        }

        .kicker{
          font-size: 11px;
          color: var(--muted);
        }

        .h2{
          font-size: 22px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .sectionTitle{
          display:flex;
          align-items:center;
          gap: 12px;
          margin: 18px 0 10px;
        }

        .dot{
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--cyan);
          box-shadow: 0 0 0 4px rgba(56,242,255,0.10);
        }
        .dot.violet{
          background: var(--violet);
          box-shadow: 0 0 0 4px rgba(167,139,250,0.10);
        }

        .h1{
          font-size: 18px;
          font-weight: 900;
          letter-spacing: .06em;
        }

        .sub{
          font-size: 11px;
          color: var(--muted);
          margin-top: 4px;
        }

        .chip{
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          font-size: 11px;
          color: var(--muted);
        }
        .chip.cyan{ border-color: rgba(56,242,255,0.22); color: rgba(56,242,255,0.92); }
        .chip.violet{ border-color: rgba(167,139,250,0.22); color: rgba(167,139,250,0.92); }
        .chip.amber{ border-color: rgba(228,183,58,0.22); color: rgba(228,183,58,0.92); }
        .chip.neutral{ }

        .statsRow{
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 980px){
          .statsRow{ grid-template-columns: 1fr; }
        }

        .statTile{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(6,10,18,0.25);
          padding: 12px;
        }
        .statLabel{
          font-size: 10px;
          color: var(--muted2);
        }
        .statValue{
          margin-top: 8px;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .campaignList{
          display:flex;
          flex-direction:column;
          gap: 10px;
        }

        .campaignItem{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(6,10,18,0.25);
          padding: 12px;
          overflow:hidden;
        }

        .campaignHead{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap: 12px;
        }

        .campaignTitle{
          font-size: 14px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .campaignDesc{
          margin-top: 6px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.45;
        }

        .progressWrap{
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          overflow:hidden;
          margin-top: 10px;
        }
        .progressFill{ height: 100%; border-radius: 999px; }

        .sectorPanel{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(6,10,18,0.22);
          padding: 14px;
        }

        .sectorHead{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          flex-wrap:wrap;
        }

        .sectorTitle{
          font-size: 11px;
          color: var(--muted);
          display:flex;
          align-items:center;
          gap: 8px;
        }

        .diamond{
          width: 10px;
          height: 10px;
          transform: rotate(45deg);
          background: rgba(56,242,255,0.55);
          border-radius: 3px;
          box-shadow: 0 0 0 4px rgba(56,242,255,0.08);
        }

        .sectorCoords{
          font-size: 11px;
          color: rgba(56,242,255,0.85);
        }

        .sectorQuote{
          margin-top: 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          padding: 12px;
          display:flex;
          gap: 10px;
          align-items:flex-start;
        }

        .quoteBar{
          width: 6px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(56,242,255,0.65), rgba(167,139,250,0.35));
          margin-top: 2px;
        }

        .quoteText{
          color: var(--muted);
          font-size: 12px;
          line-height: 1.45;
        }

        .metricRow{
          margin-top: 12px;
          display:grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 980px){
          .metricRow{ grid-template-columns: 1fr; }
        }

        .metricCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(6,10,18,0.25);
          padding: 12px;
        }
        .metricLabel{ font-size: 10px; color: var(--muted2); }
        .metricRight{ float:right; }

        .row2{
          margin-top: 10px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 980px){
          .row2{ grid-template-columns: 1fr; }
        }

        .miniGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        @media (max-width: 980px){
          .miniGrid{ grid-template-columns: 1fr; }
        }

        .recentGrid{
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 12px;
        }
        @media (max-width: 980px){
          .recentGrid{ grid-template-columns: 1fr; }
        }

        .recentCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(6,10,18,0.22);
          padding: 12px;
          cursor:pointer;
        }

        .recentMeta{
          font-size: 10px;
          color: var(--muted2);
        }
        .recentTitle{
          margin-top: 6px;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: .03em;
        }
        .recentTags{
          margin-top: 8px;
          display:flex;
          gap: 8px;
          flex-wrap:wrap;
        }

        .loading{
          opacity: .75;
          font-size: 12px;
          color: var(--muted);
          margin-top: 14px;
        }
      `}</style>

      <div className="container">
        <div className="topRow">
          <div className="brand">
            <div className="brandMark" />
            <div className="brandText">
              <div className="h1">HELVARIX GLOBAL ARRAY</div>
              <div className="mono sub">Astronomical observation pipeline</div>
            </div>
          </div>

          <div className="actions">
            <button className="btn primary" onClick={openSubmit}>
              Submit Observation
            </button>
            <button className="btn" onClick={openGuild}>
              Research Guild
            </button>
            <button className="btn" onClick={openCampaigns}>
              Campaigns
            </button>
          </div>
        </div>

        <div className="grid">
          {/* LEFT: Identity + Campaigns */}
          <div className="card">
            <div className="cardTitle">
              <div>
                <div className="mono kicker">OPERATOR</div>
                <div className="h2">{userCallsign}</div>
              </div>
              <Chip tone="cyan">{userRole}</Chip>
            </div>

            <div className="statsRow">
              <StatTile label="Observation Index" value={obsIndex.toLocaleString()} />
              <StatTile label="Campaign Impact" value={impact.toLocaleString()} />
              <StatTile label="Streak (Days)" value={streak.toLocaleString()} />
            </div>

            <div className="sectionTitle" style={{ marginTop: 18 }}>
              <span className="dot" />
              <div>
                <div className="h1">ACTIVE CAMPAIGNS</div>
                <div className="mono sub">Daily • weekly • global objectives</div>
              </div>
            </div>

            <div className="campaignList">
              {campaignsSorted.length === 0 ? (
                <div className="loading">No active campaigns.</div>
              ) : (
                campaignsSorted.map((c) => (
                  <div className="campaignItem" key={c.key}>
                    <div className="campaignHead">
                      <div>
                        <div className="campaignTitle">{c.title}</div>
                        {c.desc ? <div className="campaignDesc">{c.desc}</div> : null}
                      </div>
                      <Chip tone={c.accent}>{c.endsIn}</Chip>
                    </div>

                    <ProgressBar value={c.progress} accent={c.accent} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: Recent */}
          <div className="card">
            <div className="cardTitle">
              <div>
                <div className="mono kicker">ACTIVITY</div>
                <div className="h2">Recent Observations</div>
              </div>
              <Chip tone="violet">{userSubmissions.toLocaleString()} Submissions</Chip>
            </div>

            {loading ? (
              <div className="loading">Synchronizing…</div>
            ) : (
              <div className="recentGrid">
                {recentObs.map((o) => {
                  const ts = new Date(o.created_at).toLocaleString();
                  const title = o.target ?? "UNSPECIFIED TARGET";
                  const mode = (o.mode ?? "UNKNOWN").toUpperCase();
                  const tags = (o.tags ?? []).slice(0, 4);

                  return (
                    <div
                      className="recentCard"
                      key={o.id}
                      onClick={() => nav(`/observation/${o.id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="mono recentMeta">{ts}</div>
                      <div className="recentTitle">{title}</div>
                      <div className="recentTags">
                        <Chip tone="cyan">{mode}</Chip>
                        {tags.map((t) => (
                          <Chip tone="neutral" key={t}>
                            {t}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* LOCAL SECTOR DATA */}
        <div className="sectionTitle" style={{ marginTop: 22 }}>
          <span className="dot violet" />
          <div>
            <div className="h1">LOCAL SECTOR DATA</div>
            <div className="mono sub">Sector GPS • sky conditions • collection windows</div>
          </div>
        </div>

        <div className="card">
          <div className="sectorPanel">
            <div className="sectorHead">
              <div className="mono sectorTitle">
                <span className="diamond" /> SECTOR ANALYSIS
              </div>
              <div className="mono sectorCoords">{sectorCoords}</div>
            </div>

            <div className="sectorQuote">
              <div className="quoteBar" />
              <div className="quoteText">
                {earth
                  ? `“Local telemetry synchronized (${earth.skyState}).”`
                  : "“Initializing localized telemetry stream…”"}
              </div>
            </div>

            {earthErr ? (
              <div style={{ color: "var(--danger)", marginTop: 10 }}>{earthErr}</div>
            ) : null}

            <div className="metricRow">
              <div className="metricCard">
                <div className="mono metricLabel">PHOTON FLUX STABILITY</div>
                <div className="metricRight mono" style={{ color: "var(--cyan)" }}>
                  {photonFlux != null ? `${photonFlux}%` : "—"}
                </div>
                <div style={{ marginTop: 10 }}>
                  <ProgressBar
                    value={photonFlux != null ? photonFlux / 100 : 0}
                    accent="cyan"
                  />
                </div>
              </div>

              <div className="metricCard">
                <div className="mono metricLabel">KP INDEX</div>
                <div className="metricRight">
                  <Chip tone={kpTone as any}>{earth?.kpLabel ?? "UNKNOWN"}</Chip>
                </div>
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  {earth?.kp != null ? `Kp ${earth.kp}` : "—"}
                </div>
              </div>

              <div className="metricCard">
                <div className="mono metricLabel">SUN ALTITUDE</div>
                <div className="metricRight mono" style={{ color: "var(--violet)" }}>
                  {earth ? `${earth.sunAltNowDeg}°` : "—"}
                </div>
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  {earth?.skyState ?? "—"}
                </div>
              </div>
            </div>

            <div className="row2">
              <div className="metricCard">
                <div className="mono metricLabel">OPTIMAL COLLECTION START</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>
                  {earth?.optimalCollectionStartLocal ?? "—"}
                </div>
              </div>

              <div className="metricCard">
                <div className="mono metricLabel">NIGHT REMAINING</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>
                  {earth?.nightRemaining ?? "—"}
                </div>
              </div>
            </div>

            <div className="miniGrid">
              <div className="metricCard">
                <div className="mono metricLabel">LOCAL TIME</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>
                  {earth?.timeLocal ?? "—"}
                </div>
              </div>

              <div className="metricCard">
                <div className="mono metricLabel">SECTOR BUSY</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>
                  {earthBusy ? "YES" : "NO"}
                </div>
              </div>
            </div>

            {earth?.hours?.length ? (
              <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--muted2)" }}>
                  HORIZON WINDOW (12H)
                </div>
                <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                  {earth.hours.join(" • ")}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
