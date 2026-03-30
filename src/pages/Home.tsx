import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL" | "RESEARCH";

type CampaignRow = {
  id: string;
  cadence: CampaignCadence | null;
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  goal_user: number | null;
  goal_global: number | null;
  tags: string[] | null;
  is_active: boolean | null;
  target_type?: string | null;
  access_tier?: string | null;
};

type CampaignProgressRow = {
  id: string;
  title: string | null;
  cadence: CampaignCadence | null;
  description: string | null;
  end_at: string | null;
  progress: number | null;
  participant_count?: number | null;
  completion_pct?: number | null;
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
  city?: string | null;
  country?: string | null;
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

type HomeCampaignCard = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  progress: number;
  participantCount: number;
  targetType: string | null;
  tags: string[];
};

type SectorState = "DAYLIGHT" | "CIVIL" | "NAUTICAL" | "ASTRONOMICAL" | "NIGHT" | "UNKNOWN";

type SectorTelemetry = {
  lat: number | null;
  lon: number | null;
  localTime: string;
  skyState: SectorState;
  sunAltitude: number;
  photonFluxStabilityPct: number;
  kpLabel: "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "UNKNOWN";
  kp: number | null;
  optimalCollectionStartLocal: string | null;
  nightRemaining: string | null;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function wrap360(deg: number) {
  let value = deg % 360;
  if (value < 0) value += 360;
  return value;
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

function skyStateFromAlt(alt: number): SectorState {
  if (alt > 0) return "DAYLIGHT";
  if (alt > -6) return "CIVIL";
  if (alt > -12) return "NAUTICAL";
  if (alt > -18) return "ASTRONOMICAL";
  return "NIGHT";
}

function formatLatLon(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return "UNSPECIFIED SECTOR";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns} • ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function formatEndsIn(endAt: string | null) {
  if (!endAt) return "OPEN WINDOW";
  const diff = new Date(endAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return "OPEN WINDOW";
  if (diff <= 0) return "ENDED";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `ENDS IN ${days}D`;
  if (hours >= 1) return `ENDS IN ${hours}H`;
  return `ENDS IN ${minutes}M`;
}

function formatDateRange(startAt: string | null, endAt: string | null) {
  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;

  const startText = start && !Number.isNaN(start.getTime()) ? start.toLocaleDateString() : "Now";
  const endText = end && !Number.isNaN(end.getTime()) ? end.toLocaleDateString() : "Open";

  return `${startText} — ${endText}`;
}

function cadenceTone(cadence: CampaignCadence | null | undefined): "cyan" | "violet" | "amber" {
  if (cadence === "DAILY") return "cyan";
  if (cadence === "WEEKLY") return "violet";
  return "amber";
}

function cadenceSortValue(cadence: CampaignCadence | null | undefined) {
  if (cadence === "DAILY") return 1;
  if (cadence === "WEEKLY") return 2;
  if (cadence === "GLOBAL") return 3;
  if (cadence === "RESEARCH") return 4;
  return 9;
}

function computeSectorTelemetry(lat: number | null, lon: number | null): SectorTelemetry {
  const now = new Date();

  if (lat == null || lon == null) {
    return {
      lat,
      lon,
      localTime: now.toLocaleString(),
      skyState: "UNKNOWN",
      sunAltitude: 0,
      photonFluxStabilityPct: 50,
      kpLabel: "UNKNOWN",
      kp: null,
      optimalCollectionStartLocal: null,
      nightRemaining: null,
    };
  }

  const sunAltitude = Number(solarAltitudeDeg(now, lat, lon).toFixed(1));
  const skyState = skyStateFromAlt(sunAltitude);

  let photonFluxStabilityPct = 92;
  if (skyState === "DAYLIGHT") photonFluxStabilityPct = 24;
  if (skyState === "CIVIL") photonFluxStabilityPct = 48;
  if (skyState === "NAUTICAL") photonFluxStabilityPct = 71;
  if (skyState === "ASTRONOMICAL") photonFluxStabilityPct = 88;
  if (skyState === "NIGHT") photonFluxStabilityPct = 96;

  const kp =
    skyState === "NIGHT"
      ? 2
      : skyState === "ASTRONOMICAL"
      ? 3
      : skyState === "NAUTICAL"
      ? 4
      : 5;

  let kpLabel: SectorTelemetry["kpLabel"] = "LOW";
  if (kp >= 5) kpLabel = "HIGH";
  else if (kp >= 3) kpLabel = "MODERATE";

  let optimalCollectionStartLocal: string | null = null;
  let nightRemaining: string | null = null;

  if (skyState === "NIGHT" || skyState === "ASTRONOMICAL") {
    optimalCollectionStartLocal = "ACTIVE NOW";
    nightRemaining = "4H+";
  } else if (skyState === "NAUTICAL") {
    optimalCollectionStartLocal = "WITHIN 1H";
    nightRemaining = "3H+";
  } else if (skyState === "CIVIL") {
    optimalCollectionStartLocal = "AFTER DUSK";
    nightRemaining = "PENDING";
  }

  return {
    lat,
    lon,
    localTime: now.toLocaleString(),
    skyState,
    sunAltitude,
    photonFluxStabilityPct,
    kpLabel,
    kp,
    optimalCollectionStartLocal,
    nightRemaining,
  };
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "cyan" | "violet" | "amber" | "neutral";
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

function Progress({
  value,
  tone = "cyan",
}: {
  value: number;
  tone?: "cyan" | "violet" | "amber";
}) {
  return (
    <div className="progressTrack">
      <div
        className={`progressFill ${tone}`}
        style={{ width: `${Math.round(clamp(value) * 100)}%` }}
      />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="statCard">
      <div className="eyebrow">{label}</div>
      <div className="statValue">{value}</div>
      {hint ? <div className="statHint">{hint}</div> : null}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [recentObservations, setRecentObservations] = useState<ObservationRow[]>([]);
  const [observationCount, setObservationCount] = useState(0);

  const [campaignCards, setCampaignCards] = useState<HomeCampaignCard[]>([]);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<SectorTelemetry | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadHome() {
      setLoading(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;

        const userId = sessionData.session?.user?.id ?? null;
        setSessionUserId(userId);

        let loadedProfile: ProfileRow | null = null;

        if (userId) {
          loadedProfile = await loadProfile(userId);
          if (!mounted) return;
          setProfile(loadedProfile);
        }

        await Promise.all([
          loadRecentObservations(),
          loadObservationCount(userId),
          loadCampaignSection(userId),
        ]);

        if (!mounted) return;

        const lat = loadedProfile?.lat ?? null;
        const lon = loadedProfile?.lon ?? null;
        setTelemetry(computeSectorTelemetry(lat, lon));
      } catch (error) {
        console.error("Home page failed to load:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadHome();

    return () => {
      mounted = false;
    };
  }, []);

  async function loadProfile(userId: string): Promise<ProfileRow | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,callsign,role,observation_index,campaign_impact,streak_days,lat,lon,city,country"
        )
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("Profile query failed:", error.message);
        return null;
      }

      return (data as ProfileRow | null) ?? null;
    } catch (error) {
      console.warn("Profile query threw:", error);
      return null;
    }
  }

  async function loadRecentObservations() {
    try {
      const { data, error } = await supabase
        .from("observations")
        .select("id,user_id,created_at,mode,target,tags,image_url")
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) {
        console.warn("Recent observations query failed:", error.message);
        setRecentObservations([]);
        return;
      }

      setRecentObservations((data as ObservationRow[]) ?? []);
    } catch (error) {
      console.warn("Recent observations query threw:", error);
      setRecentObservations([]);
    }
  }

  async function loadObservationCount(userId: string | null) {
    if (!userId) {
      setObservationCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from("observations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (error) {
        console.warn("Observation count query failed:", error.message);
        setObservationCount(0);
        return;
      }

      setObservationCount(count ?? 0);
    } catch (error) {
      console.warn("Observation count query threw:", error);
      setObservationCount(0);
    }
  }

  async function loadCampaignSection(userId: string | null) {
    setCampaignError(null);

    if (userId) {
      try {
        const { data, error } = await supabase.rpc("get_home_campaign_progress", {
          user_id: userId,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          const mapped = (data as CampaignProgressRow[])
            .map((row) => ({
              id: row.id,
              cadence: (row.cadence ?? "GLOBAL") as CampaignCadence,
              title: row.title ?? "Untitled Campaign",
              description: row.description ?? "Array-wide observation objective.",
              startAt: null,
              endAt: row.end_at ?? null,
              progress:
                row.completion_pct != null
                  ? clamp(Number(row.completion_pct) / 100)
                  : clamp(Number(row.progress ?? 0)),
              participantCount: Number(row.participant_count ?? 0),
              targetType: null,
              tags: [],
            }))
            .sort((a, b) => cadenceSortValue(a.cadence) - cadenceSortValue(b.cadence));

          setCampaignCards(mapped);
          return;
        }
      } catch (error) {
        console.warn("Campaign RPC threw:", error);
      }
    }

    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id,cadence,title,description,start_at,end_at,goal_user,goal_global,tags,is_active,target_type,access_tier"
        )
        .eq("is_active", true)
        .order("start_at", { ascending: false })
        .limit(6);

      if (error) {
        console.warn("Campaign table query failed:", error.message);
        setCampaignCards([]);
        setCampaignError("Campaign data is not available yet.");
        return;
      }

      const rows = ((data as CampaignRow[]) ?? [])
        .map((row) => ({
          id: row.id,
          cadence: (row.cadence ?? "GLOBAL") as CampaignCadence,
          title: row.title ?? "Untitled Campaign",
          description: row.description ?? "Array-wide observation objective.",
          startAt: row.start_at ?? null,
          endAt: row.end_at ?? null,
          progress: 0,
          participantCount: 0,
          targetType: row.target_type ?? null,
          tags: row.tags ?? [],
        }))
        .sort((a, b) => cadenceSortValue(a.cadence) - cadenceSortValue(b.cadence));

      setCampaignCards(rows);
    } catch (error) {
      console.warn("Campaign table query threw:", error);
      setCampaignCards([]);
      setCampaignError("Campaign data is not available yet.");
    }
  }

  const operatorCallsign = profile?.callsign ?? "UNASSIGNED";
  const operatorRole = profile?.role ?? "OBSERVER";

  const profileLocation = useMemo(() => {
    const city = profile?.city?.trim();
    const country = profile?.country?.trim();

    if (city && country) return `${city}, ${country}`;
    if (city) return city;
    if (country) return country;

    return "Location not set";
  }, [profile]);

  const sectorCoords = useMemo(
    () => formatLatLon(profile?.lat ?? null, profile?.lon ?? null),
    [profile]
  );

  const topCampaign = campaignCards[0] ?? null;
  const secondaryCampaigns = campaignCards.slice(1, 5);

  return (
    <div className="homePage">
      <style>{`
        :root{
          --home-bg:#070b14;
          --home-panel:rgba(10,14,26,.76);
          --home-panel-2:rgba(8,12,22,.52);
          --home-stroke:rgba(255,255,255,.08);
          --home-text:rgba(255,255,255,.94);
          --home-muted:rgba(255,255,255,.64);
          --home-dim:rgba(255,255,255,.42);
          --home-cyan:#38f2ff;
          --home-violet:#9d7cff;
          --home-amber:#ffcd57;
          --home-red:#ff6b7d;
        }

        .homePage{
          min-height:100vh;
          color:var(--home-text);
          background:
            radial-gradient(900px 540px at 8% -10%, rgba(56,242,255,.12), transparent 55%),
            radial-gradient(900px 540px at 100% 0%, rgba(157,124,255,.16), transparent 50%),
            linear-gradient(180deg, #040711 0%, #070b14 40%, #050812 100%);
          padding: 26px 18px 110px;
        }

        .homeContainer{
          max-width: 1180px;
          margin: 0 auto;
        }

        .eyebrow{
          font-size: 11px;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: var(--home-dim);
        }

        .hero{
          display:grid;
          grid-template-columns: 1.4fr .9fr;
          gap: 16px;
          margin-bottom: 18px;
        }

        @media (max-width: 980px){
          .hero{
            grid-template-columns: 1fr;
          }
        }

        .panel{
          border: 1px solid var(--home-stroke);
          background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
          border-radius: 24px;
          box-shadow: 0 18px 50px rgba(0,0,0,.26);
          backdrop-filter: blur(16px);
        }

        .heroMain{
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .heroMain:before{
          content:"";
          position:absolute;
          inset:auto -120px -120px auto;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(56,242,255,.12), transparent 68%);
          pointer-events:none;
        }

        .heroTop{
          display:flex;
          justify-content:space-between;
          gap:16px;
          align-items:flex-start;
          flex-wrap:wrap;
        }

        .brandWrap{
          display:flex;
          gap:14px;
          align-items:flex-start;
        }

        .brandMark{
          width: 48px;
          height: 48px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.08);
          background:
            radial-gradient(circle at 28% 28%, rgba(56,242,255,.4), transparent 46%),
            radial-gradient(circle at 72% 74%, rgba(157,124,255,.34), transparent 50%),
            rgba(255,255,255,.03);
          flex-shrink:0;
        }

        .heroTitle{
          font-size: clamp(28px, 4vw, 42px);
          line-height: 1.02;
          font-weight: 900;
          margin: 8px 0 8px;
          letter-spacing: -.03em;
        }

        .heroText{
          max-width: 640px;
          color: var(--home-muted);
          line-height: 1.55;
          font-size: 14px;
        }

        .actionRow{
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          margin-top: 18px;
        }

        .btn{
          border: 1px solid var(--home-stroke);
          color: var(--home-text);
          background: rgba(255,255,255,.04);
          border-radius: 14px;
          padding: 12px 15px;
          font-weight: 800;
          cursor: pointer;
          transition: transform .12s ease, border-color .12s ease, background .12s ease;
        }

        .btn:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
        }

        .btn.primary{
          background: linear-gradient(90deg, rgba(56,242,255,.16), rgba(157,124,255,.16));
          border-color: rgba(56,242,255,.28);
        }

        .heroAside{
          padding: 20px;
          display:flex;
          flex-direction:column;
          gap: 14px;
        }

        .statusCard{
          padding: 16px;
          border-radius: 18px;
          background: var(--home-panel-2);
          border: 1px solid rgba(255,255,255,.06);
        }

        .statusValue{
          margin-top: 8px;
          font-size: 24px;
          font-weight: 900;
        }

        .statusSub{
          margin-top: 6px;
          color: var(--home-muted);
          font-size: 13px;
        }

        .chip{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height: 28px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: .12em;
          text-transform: uppercase;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.04);
          color: var(--home-text);
        }

        .chip.cyan{
          border-color: rgba(56,242,255,.28);
          color: var(--home-cyan);
        }

        .chip.violet{
          border-color: rgba(157,124,255,.26);
          color: #c3b0ff;
        }

        .chip.amber{
          border-color: rgba(255,205,87,.26);
          color: var(--home-amber);
        }

        .chip.neutral{
          color: var(--home-muted);
        }

        .statsGrid{
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 18px;
        }

        @media (max-width: 980px){
          .statsGrid{
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px){
          .statsGrid{
            grid-template-columns: 1fr;
          }
        }

        .statCard{
          padding: 18px;
          border-radius: 22px;
          border: 1px solid var(--home-stroke);
          background: var(--home-panel);
        }

        .statValue{
          margin-top: 10px;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .statHint{
          margin-top: 8px;
          color: var(--home-muted);
          font-size: 13px;
        }

        .mainGrid{
          display:grid;
          grid-template-columns: 1.2fr .8fr;
          gap: 16px;
          margin-bottom: 16px;
          align-items:start;
        }

        @media (max-width: 980px){
          .mainGrid{
            grid-template-columns: 1fr;
          }
        }

        .section{
          padding: 20px;
        }

        .sectionHeader{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .sectionTitle{
          margin-top: 6px;
          font-size: 24px;
          line-height: 1.08;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .sectionText{
          margin-top: 6px;
          color: var(--home-muted);
          line-height: 1.5;
          font-size: 14px;
          max-width: 620px;
        }

        .campaignSectionBody{
          display:grid;
          gap: 14px;
        }

        .campaignHero{
          border-radius: 22px;
          border: 1px solid rgba(56,242,255,.14);
          background:
            radial-gradient(circle at top right, rgba(56,242,255,.08), transparent 38%),
            linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
          padding: 18px;
        }

        .campaignHeroTop{
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:flex-start;
          flex-wrap:wrap;
        }

        .campaignName{
          margin-top: 8px;
          font-size: 26px;
          font-weight: 900;
          line-height: 1.05;
        }

        .campaignDesc{
          margin-top: 10px;
          color: var(--home-muted);
          line-height: 1.55;
          font-size: 14px;
          max-width: 720px;
        }

        .metaGrid{
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-top: 16px;
        }

        @media (max-width: 900px){
          .metaGrid{
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 560px){
          .metaGrid{
            grid-template-columns: 1fr;
          }
        }

        .metaCard{
          padding: 12px;
          border-radius: 16px;
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.06);
        }

        .metaValue{
          margin-top: 8px;
          font-size: 16px;
          font-weight: 800;
        }

        .progressBlock{
          margin-top: 16px;
        }

        .progressTrack{
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.05);
        }

        .progressFill{
          height: 100%;
          border-radius: 999px;
        }

        .progressFill.cyan{
          background: linear-gradient(90deg, var(--home-cyan), rgba(157,124,255,.95));
        }

        .progressFill.violet{
          background: linear-gradient(90deg, rgba(157,124,255,.95), rgba(56,242,255,.85));
        }

        .progressFill.amber{
          background: linear-gradient(90deg, rgba(255,205,87,.95), rgba(255,140,92,.85));
        }

        .progressMeta{
          margin-top: 8px;
          display:flex;
          justify-content:space-between;
          gap: 12px;
          color: var(--home-muted);
          font-size: 13px;
        }

        .campaignListCompact{
          display:grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          max-height: 420px;
          overflow:auto;
          padding-right: 4px;
        }

        @media (max-width: 900px){
          .campaignListCompact{
            grid-template-columns: 1fr;
            max-height:none;
            overflow:visible;
          }
        }

        .campaignCompact{
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.06);
          background: rgba(255,255,255,.03);
          display:grid;
          gap: 10px;
          min-width: 0;
        }

        .campaignCompactTop{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap: 10px;
        }

        .campaignCompactTitle{
          font-size: 16px;
          font-weight: 800;
          line-height: 1.2;
        }

        .campaignCompactDesc{
          color: var(--home-muted);
          font-size: 13px;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .campaignCompactMeta{
          display:flex;
          justify-content:space-between;
          gap: 10px;
          color: var(--home-muted);
          font-size: 12px;
        }

        .emptyState{
          padding: 18px;
          border-radius: 18px;
          border: 1px dashed rgba(255,255,255,.12);
          background: rgba(255,255,255,.02);
        }

        .emptyStateTitle{
          font-size: 18px;
          font-weight: 800;
        }

        .emptyStateText{
          margin-top: 8px;
          color: var(--home-muted);
          line-height: 1.5;
          font-size: 14px;
        }

        .sideStack{
          display:grid;
          gap: 16px;
        }

        .obsList{
          display:grid;
          gap: 12px;
        }

        .obsCard{
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.06);
          background: rgba(255,255,255,.03);
        }

        .obsTop{
          display:flex;
          justify-content:space-between;
          gap: 10px;
          align-items:flex-start;
          flex-wrap: wrap;
        }

        .obsTitle{
          margin-top: 8px;
          font-size: 16px;
          font-weight: 800;
        }

        .obsMeta{
          margin-top: 8px;
          color: var(--home-muted);
          font-size: 13px;
        }

        .tagRow{
          display:flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .telemetryGrid{
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        @media (max-width: 980px){
          .telemetryGrid{
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px){
          .telemetryGrid{
            grid-template-columns: 1fr;
          }
        }

        .telemetryCard{
          padding: 18px;
          border-radius: 20px;
          border: 1px solid var(--home-stroke);
          background: var(--home-panel);
        }

        .telemetryValue{
          margin-top: 10px;
          font-size: 22px;
          font-weight: 900;
        }

        .telemetrySub{
          margin-top: 8px;
          font-size: 13px;
          color: var(--home-muted);
        }

        .footerAction{
          margin-top: 16px;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        }

        .loadingText{
          color: var(--home-muted);
          font-size: 14px;
        }

        .warning{
          margin-top: 10px;
          color: var(--home-red);
          font-size: 13px;
        }
      `}</style>

      <div className="homeContainer">
        <section className="hero">
          <div className="panel heroMain">
            <div className="heroTop">
              <div className="brandWrap">
                <div className="brandMark" />
                <div>
                  <div className="eyebrow">Helvarix Global Array</div>
                  <div className="heroTitle">Personalized observation operations for every user.</div>
                  <div className="heroText">
                    Coordinate amateur astronomy efforts through active campaigns, recent submissions,
                    and localized sector readiness. The campaign block stays visible here because it
                    is part of the core workflow, not an optional feature.
                  </div>
                </div>
              </div>

              <Chip tone="cyan">{sessionUserId ? "Authenticated" : "Public View"}</Chip>
            </div>

            <div className="actionRow">
              <button className="btn primary" onClick={() => navigate("/submit")}>
                Submit Observation
              </button>
              <button className="btn" onClick={() => navigate("/collective")}>
                Campaign Hub
              </button>
              <button className="btn" onClick={() => navigate("/array")}>
                Open Array
              </button>
            </div>
          </div>

          <div className="panel heroAside">
            <div className="statusCard">
              <div className="eyebrow">Operator</div>
              <div className="statusValue">{operatorCallsign}</div>
              <div className="statusSub">{operatorRole}</div>
            </div>

            <div className="statusCard">
              <div className="eyebrow">Sector</div>
              <div className="statusValue">{profileLocation}</div>
              <div className="statusSub">{sectorCoords}</div>
            </div>

            <div className="statusCard">
              <div className="eyebrow">Network Status</div>
              <div className="statusValue">{loading ? "Syncing…" : "Operational"}</div>
              <div className="statusSub">
                Campaigns, submissions, and telemetry surface here first.
              </div>
            </div>
          </div>
        </section>

        <section className="statsGrid">
          <StatCard
            label="Observation Index"
            value={String(profile?.observation_index ?? observationCount ?? 0)}
            hint="Your current personal submission count."
          />
          <StatCard
            label="Campaign Impact"
            value={String(profile?.campaign_impact ?? 0)}
            hint="Campaign-weighted contribution across the array."
          />
          <StatCard
            label="Active Streak"
            value={`${profile?.streak_days ?? 0}d`}
            hint="Consecutive days with submitted activity."
          />
          <StatCard
            label="Network Feed"
            value={`${recentObservations.length}`}
            hint="Most recent observations surfaced on this page."
          />
        </section>

        <section className="mainGrid">
          <div className="panel section">
            <div className="sectionHeader">
              <div>
                <div className="eyebrow">Campaigns</div>
                <div className="sectionTitle">Active array objective stays visible.</div>
                <div className="sectionText">
                  This section is intentionally prominent on the home page. It shows the lead
                  campaign first, then any additional active campaigns below it.
                </div>
              </div>
              <button className="btn" onClick={() => navigate("/collective")}>
                Open Collective
              </button>
            </div>

            <div className="campaignSectionBody">
              {topCampaign ? (
                <div className="campaignHero">
                  <div className="campaignHeroTop">
                    <div>
                      <Chip tone={cadenceTone(topCampaign.cadence)}>{topCampaign.cadence}</Chip>
                      <div className="campaignName">{topCampaign.title}</div>
                      <div className="campaignDesc">{topCampaign.description}</div>
                    </div>

                    <Chip tone={cadenceTone(topCampaign.cadence)}>{formatEndsIn(topCampaign.endAt)}</Chip>
                  </div>

                  <div className="metaGrid">
                    <div className="metaCard">
                      <div className="eyebrow">Window</div>
                      <div className="metaValue">{formatDateRange(topCampaign.startAt, topCampaign.endAt)}</div>
                    </div>
                    <div className="metaCard">
                      <div className="eyebrow">Target</div>
                      <div className="metaValue">{topCampaign.targetType ?? "General observation"}</div>
                    </div>
                    <div className="metaCard">
                      <div className="eyebrow">Participants</div>
                      <div className="metaValue">{topCampaign.participantCount}</div>
                    </div>
                    <div className="metaCard">
                      <div className="eyebrow">Progress</div>
                      <div className="metaValue">{Math.round(topCampaign.progress * 100)}%</div>
                    </div>
                  </div>

                  <div className="progressBlock">
                    <Progress value={topCampaign.progress} tone={cadenceTone(topCampaign.cadence)} />
                    <div className="progressMeta">
                      <span>
                        {topCampaign.tags.length > 0
                          ? topCampaign.tags.join(" • ")
                          : "Array-wide mission objective"}
                      </span>
                      <span>{Math.round(topCampaign.progress * 100)}% complete</span>
                    </div>
                  </div>

                  <div className="footerAction">
                    <button className="btn primary" onClick={() => navigate("/submit")}>
                      Submit to Campaign
                    </button>
                    <button className="btn" onClick={() => navigate("/collective")}>
                      Campaign Details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="emptyState">
                  <div className="emptyStateTitle">No active campaign right now</div>
                  <div className="emptyStateText">
                    The campaign block remains here even when there is no current objective. That
                    keeps the home page stable and avoids the section disappearing.
                  </div>
                  <div className="footerAction">
                    <button className="btn" onClick={() => navigate("/collective")}>
                      Open Campaign Hub
                    </button>
                  </div>
                  {campaignError ? <div className="warning">{campaignError}</div> : null}
                </div>
              )}

              {secondaryCampaigns.length > 0 ? (
                <div className="campaignListCompact">
                  {secondaryCampaigns.map((campaign) => (
                    <div className="campaignCompact" key={campaign.id}>
                      <div className="campaignCompactTop">
                        <div className="campaignCompactTitle">{campaign.title}</div>
                        <Chip tone={cadenceTone(campaign.cadence)}>{campaign.cadence}</Chip>
                      </div>

                      <div className="campaignCompactDesc">{campaign.description}</div>

                      <Progress value={campaign.progress} tone={cadenceTone(campaign.cadence)} />

                      <div className="campaignCompactMeta">
                        <span>{formatDateRange(campaign.startAt, campaign.endAt)}</span>
                        <span>{Math.round(campaign.progress * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="sideStack">
            <div className="panel section">
              <div className="sectionHeader">
                <div>
                  <div className="eyebrow">Recent Observations</div>
                  <div className="sectionTitle">Latest network activity</div>
                </div>
                <button className="btn" onClick={() => navigate("/submit")}>
                  Add New
                </button>
              </div>

              {loading ? (
                <div className="loadingText">Loading recent observations…</div>
              ) : recentObservations.length > 0 ? (
                <div className="obsList">
                  {recentObservations.map((observation) => (
                    <div className="obsCard" key={observation.id}>
                      <div className="obsTop">
                        <Chip tone="cyan">{(observation.mode ?? "Unknown").toUpperCase()}</Chip>
                        <div className="eyebrow">
                          {new Date(observation.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="obsTitle">{observation.target ?? "Unspecified Target"}</div>
                      <div className="obsMeta">
                        Contributor: {observation.user_id === sessionUserId ? "You" : "Network Member"}
                      </div>
                      {(observation.tags ?? []).length > 0 ? (
                        <div className="tagRow">
                          {(observation.tags ?? []).slice(0, 4).map((tag) => (
                            <Chip key={tag}>{tag}</Chip>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="emptyState">
                  <div className="emptyStateTitle">No recent observations</div>
                  <div className="emptyStateText">
                    Once observations are submitted, they will appear here for quick visibility.
                  </div>
                </div>
              )}
            </div>

            <div className="panel section">
              <div className="sectionHeader">
                <div>
                  <div className="eyebrow">Sector Readiness</div>
                  <div className="sectionTitle">Localized sky conditions</div>
                </div>
                <button className="btn" onClick={() => navigate("/telemetry")}>
                  Open Telemetry
                </button>
              </div>

              <div className="telemetryGrid">
                <div className="telemetryCard">
                  <div className="eyebrow">Sky State</div>
                  <div className="telemetryValue">{telemetry?.skyState ?? "UNKNOWN"}</div>
                  <div className="telemetrySub">Based on profile latitude and longitude</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Sun Altitude</div>
                  <div className="telemetryValue">
                    {telemetry ? `${telemetry.sunAltitude.toFixed(1)}°` : "—"}
                  </div>
                  <div className="telemetrySub">Lower values favor night collection</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Photon Flux Stability</div>
                  <div className="telemetryValue">
                    {telemetry ? `${telemetry.photonFluxStabilityPct}%` : "—"}
                  </div>
                  <div className="telemetrySub">Estimated readiness window</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Geomagnetic Index</div>
                  <div className="telemetryValue">{telemetry?.kpLabel ?? "UNKNOWN"}</div>
                  <div className="telemetrySub">
                    {telemetry?.kp != null ? `Kp ${telemetry.kp}` : "No index available"}
                  </div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Collection Start</div>
                  <div className="telemetryValue">
                    {telemetry?.optimalCollectionStartLocal ?? "Pending"}
                  </div>
                  <div className="telemetrySub">Suggested start for useful observation</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Night Remaining</div>
                  <div className="telemetryValue">
                    {telemetry?.nightRemaining ?? "Unavailable"}
                  </div>
                  <div className="telemetrySub">Simple planning estimate</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Local Time</div>
                  <div className="telemetryValue">{telemetry?.localTime ?? "—"}</div>
                  <div className="telemetrySub">Computed on page load</div>
                </div>

                <div className="telemetryCard">
                  <div className="eyebrow">Sector Coordinates</div>
                  <div className="telemetryValue" style={{ fontSize: "18px" }}>
                    {sectorCoords}
                  </div>
                  <div className="telemetrySub">Update in profile to localize this section</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
