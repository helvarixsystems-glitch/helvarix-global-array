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
  campaign_class?: string | null;
};

type CampaignMembershipRow = {
  campaign_id: string;
  user_id: string | null;
  team_id: string | null;
  status: string | null;
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
  accessTier: string;
  campaignClass: string;
};

type SectorState = "DAYLIGHT" | "CIVIL" | "NAUTICAL" | "ASTRONOMICAL" | "NIGHT" | "UNKNOWN";

type WeatherSnapshot = {
  temperatureC: number | null;
  windKph: number | null;
  cloudCover: number | null;
  precipitationProbability: number | null;
  visibilityKm: number | null;
  sunriseIso: string | null;
  sunsetIso: string | null;
  weatherCode: number | null;
};

type LocalConditions = {
  localTime: string;
  skyState: SectorState;
  sunAltitude: number | null;
  weatherSummary: string;
  temperatureLabel: string;
  cloudCoverLabel: string;
  visibilityLabel: string;
  windLabel: string;
  precipitationLabel: string;
  sunWindowLabel: string;
  moonLabel: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
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
  const lambda = wrap360(L + 1.915 * Math.sin(toRad(g)) + 0.02 * Math.sin(toRad(2 * g)));
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

function skyStateFromAlt(alt: number | null): SectorState {
  if (alt == null) return "UNKNOWN";
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

function getMoonPhaseFraction(date = new Date()) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (date.getTime() - knownNewMoon) / 86400000;
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  return phase / synodicMonth;
}

function getMoonPhaseLabel(fraction: number) {
  if (fraction < 0.03 || fraction > 0.97) return "New Moon";
  if (fraction < 0.22) return "Waxing Crescent";
  if (fraction < 0.28) return "First Quarter";
  if (fraction < 0.47) return "Waxing Gibbous";
  if (fraction < 0.53) return "Full Moon";
  if (fraction < 0.72) return "Waning Gibbous";
  if (fraction < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

function getMoonIlluminationPercent(fraction: number) {
  return Math.round(((1 - Math.cos(2 * Math.PI * fraction)) / 2) * 100);
}

function getWeatherSummary(code: number | null) {
  if (code == null) return "Unavailable";
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Mostly clear";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Variable";
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "cyan" | "violet" | "amber" | "neutral"; }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

function Progress({ value, tone = "cyan" }: { value: number; tone?: "cyan" | "violet" | "amber"; }) {
  return (
    <div className="progressTrack">
      <div className={`progressFill ${tone}`} style={{ width: `${Math.round(clamp(value) * 100)}%` }} />
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

function TelemetryCard({ label, value, hint, compact = false }: { label: string; value: string; hint: string; compact?: boolean; }) {
  return (
    <div className={`telemetryCard ${compact ? "compact" : ""}`}>
      <div className="eyebrow">{label}</div>
      <div className="telemetryValue">{value}</div>
      <div className="telemetrySub">{hint}</div>
    </div>
  );
}

async function geocodePlace(query: string): Promise<Coordinates | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Unable to geocode saved location.");
  const json = await res.json();
  const result = json?.results?.[0];
  if (!result) return null;
  return { latitude: Number(result.latitude), longitude: Number(result.longitude) };
}

async function fetchWeather(coords: Coordinates): Promise<WeatherSnapshot> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
    `&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m` +
    `&hourly=precipitation_probability,visibility` +
    `&forecast_days=1&timezone=auto`;

  const sunriseUrl =
    `https://api.sunrise-sunset.org/json?lat=${coords.latitude}&lng=${coords.longitude}&formatted=0&date=today`;

  const [forecastRes, sunriseRes] = await Promise.all([fetch(forecastUrl), fetch(sunriseUrl)]);
  if (!forecastRes.ok) throw new Error("Unable to load weather conditions.");
  if (!sunriseRes.ok) throw new Error("Unable to load solar timing.");

  const forecast = await forecastRes.json();
  const solar = await sunriseRes.json();

  const current = forecast?.current ?? {};
  const hourly = forecast?.hourly ?? {};
  const currentTime = String(current.time ?? "");
  const hourTimes: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const hourIndex = Math.max(0, hourTimes.indexOf(currentTime));

  return {
    temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
    windKph: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    cloudCover: typeof current.cloud_cover === "number" ? current.cloud_cover : null,
    precipitationProbability:
      typeof hourly?.precipitation_probability?.[hourIndex] === "number"
        ? hourly.precipitation_probability[hourIndex]
        : null,
    visibilityKm:
      typeof hourly?.visibility?.[hourIndex] === "number"
        ? hourly.visibility[hourIndex] / 1000
        : null,
    sunriseIso: solar?.results?.sunrise ?? null,
    sunsetIso: solar?.results?.sunset ?? null,
    weatherCode: typeof current.weather_code === "number" ? current.weather_code : null,
  };
}

function buildLocalConditions(lat: number | null, lon: number | null, weather: WeatherSnapshot | null): LocalConditions {
  const now = new Date();
  const altitude = lat != null && lon != null ? solarAltitudeDeg(now, lat, lon) : null;
  const skyState = skyStateFromAlt(altitude);
  const moonFraction = getMoonPhaseFraction(now);
  const moonLabel = `${getMoonPhaseLabel(moonFraction)} • ${getMoonIlluminationPercent(moonFraction)}% illuminated`;

  const sunrise = weather?.sunriseIso ? new Date(weather.sunriseIso) : null;
  const sunset = weather?.sunsetIso ? new Date(weather.sunsetIso) : null;
  const sunWindowLabel = sunrise && sunset
    ? `${sunset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} sunset • ${sunrise.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} sunrise`
    : "Unavailable";

  return {
    localTime: now.toLocaleString(),
    skyState,
    sunAltitude: altitude == null ? null : Number(altitude.toFixed(1)),
    weatherSummary: getWeatherSummary(weather?.weatherCode ?? null),
    temperatureLabel: weather?.temperatureC != null ? `${Math.round(weather.temperatureC)}°C` : "Unavailable",
    cloudCoverLabel: weather?.cloudCover != null ? `${Math.round(weather.cloudCover)}%` : "Unavailable",
    visibilityLabel: weather?.visibilityKm != null ? `${weather.visibilityKm.toFixed(1)} km` : "Unavailable",
    windLabel: weather?.windKph != null ? `${Math.round(weather.windKph)} kph` : "Unavailable",
    precipitationLabel:
      weather?.precipitationProbability != null ? `${Math.round(weather.precipitationProbability)}%` : "Unavailable",
    sunWindowLabel,
    moonLabel,
  };
}

function normalizeCampaign(row: CampaignRow): HomeCampaignCard {
  return {
    id: row.id,
    cadence: (row.cadence ?? "GLOBAL") as CampaignCadence,
    title: row.title?.trim() || "Untitled Campaign",
    description: row.description?.trim() || "Active campaign.",
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    progress: 0,
    participantCount: 0,
    targetType: row.target_type ?? null,
    tags: row.tags ?? [],
    accessTier: String(row.access_tier ?? "free").toLowerCase(),
    campaignClass: String(row.campaign_class ?? "public").toLowerCase(),
  };
}

function isResearchCampaign(campaign: HomeCampaignCard) {
  return campaign.cadence === "RESEARCH" ||
    campaign.accessTier === "research_collective" ||
    campaign.campaignClass === "research_collective";
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
  const [telemetry, setTelemetry] = useState<LocalConditions | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

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
          loadCampaignSection(),
        ]);

        if (!mounted) return;
        await loadLocalizedConditions(loadedProfile);
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
        .select("id,callsign,role,observation_index,campaign_impact,streak_days,lat,lon,city,country")
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

  async function loadCampaignSection() {
    setCampaignError(null);
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,cadence,title,description,start_at,end_at,goal_user,goal_global,tags,is_active,target_type,access_tier,campaign_class")
        .eq("is_active", true)
        .order("start_at", { ascending: false });

      if (error) {
        console.warn("Campaign table query failed:", error.message);
        setCampaignCards([]);
        setCampaignError("Campaign data is not available yet.");
        return;
      }

      const cards = ((data as CampaignRow[]) ?? [])
        .map(normalizeCampaign)
        .sort((a, b) => cadenceSortValue(a.cadence) - cadenceSortValue(b.cadence));

      const { data: membershipData } = await supabase
        .from("campaign_memberships")
        .select("campaign_id,user_id,team_id,status")
        .in("campaign_id", cards.map((card) => card.id));

      const participantCounts: Record<string, number> = {};
      const uniqueEntries = new Set<string>();
      for (const row of ((membershipData as CampaignMembershipRow[] | null) ?? [])) {
        if (String(row.status ?? "active").toLowerCase() !== "active") continue;
        const dedupe = `${row.campaign_id}:${row.team_id ?? row.user_id ?? "unknown"}`;
        if (uniqueEntries.has(dedupe)) continue;
        uniqueEntries.add(dedupe);
        participantCounts[row.campaign_id] = (participantCounts[row.campaign_id] ?? 0) + 1;
      }

      setCampaignCards(cards.map((card) => ({
        ...card,
        participantCount: participantCounts[card.id] ?? 0,
      })));
    } catch (error) {
      console.warn("Campaign table query threw:", error);
      setCampaignCards([]);
      setCampaignError("Campaign data is not available yet.");
    }
  }

  async function loadLocalizedConditions(loadedProfile: ProfileRow | null) {
    setTelemetryLoading(true);
    try {
      let lat = loadedProfile?.lat ?? null;
      let lon = loadedProfile?.lon ?? null;

      if ((lat == null || lon == null) && (loadedProfile?.city || loadedProfile?.country)) {
        const query = [loadedProfile?.city?.trim(), loadedProfile?.country?.trim()].filter(Boolean).join(", ");
        if (query) {
          const coords = await geocodePlace(query);
          lat = coords?.latitude ?? null;
          lon = coords?.longitude ?? null;
        }
      }

      if (lat == null || lon == null) {
        setTelemetry(buildLocalConditions(null, null, null));
        return;
      }

      const weather = await fetchWeather({ latitude: lat, longitude: lon });
      setTelemetry(buildLocalConditions(lat, lon, weather));
    } catch (error) {
      console.warn("Localized conditions failed:", error);
      setTelemetry(buildLocalConditions(loadedProfile?.lat ?? null, loadedProfile?.lon ?? null, null));
    } finally {
      setTelemetryLoading(false);
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

  const sectorCoords = useMemo(() => formatLatLon(profile?.lat ?? null, profile?.lon ?? null), [profile]);

  const publicCampaigns = useMemo(
    () => campaignCards.filter((campaign) => !isResearchCampaign(campaign)),
    [campaignCards]
  );

  const researchCampaigns = useMemo(
    () => campaignCards.filter((campaign) => isResearchCampaign(campaign)),
    [campaignCards]
  );

  return (
    <div className="homePage">
      <style>{`
        :root{--home-bg:#070b14;--home-panel:rgba(10,14,26,.76);--home-panel-2:rgba(8,12,22,.52);--home-stroke:rgba(255,255,255,.08);--home-text:rgba(255,255,255,.94);--home-muted:rgba(255,255,255,.64);--home-dim:rgba(255,255,255,.42);--home-cyan:#38f2ff;--home-violet:#9d7cff;--home-amber:#ffcd57;--home-red:#ff6b7d;}
        .homePage{min-height:100vh;color:var(--home-text);background:radial-gradient(900px 540px at 8% -10%, rgba(56,242,255,.12), transparent 55%),radial-gradient(900px 540px at 100% 0%, rgba(157,124,255,.16), transparent 50%),linear-gradient(180deg, #040711 0%, #070b14 40%, #050812 100%);padding:26px 18px 110px;box-sizing:border-box;}
        .homeContainer{max-width:1180px;margin:0 auto;width:100%;}
        .eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--home-dim);}
        .hero{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,.9fr);gap:16px;margin-bottom:18px;}
        @media (max-width:980px){.hero{grid-template-columns:1fr;}}
        .panel{min-width:0;overflow:hidden;border:1px solid var(--home-stroke);background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));border-radius:24px;box-shadow:0 18px 50px rgba(0,0,0,.26);backdrop-filter:blur(16px);}
        .heroMain{padding:24px;position:relative;overflow:hidden;}
        .heroMain:before{content:"";position:absolute;inset:auto -120px -120px auto;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle, rgba(56,242,255,.12), transparent 68%);pointer-events:none;}
        .heroTop{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;min-width:0;}
        .brandWrap{display:flex;gap:14px;align-items:flex-start;min-width:0;}
        .brandMark{width:48px;height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:radial-gradient(circle at 28% 28%, rgba(56,242,255,.4), transparent 46%),radial-gradient(circle at 72% 74%, rgba(157,124,255,.34), transparent 50%),rgba(255,255,255,.03);flex-shrink:0;}
        .heroTitle{font-size:clamp(28px, 4vw, 42px);line-height:1.02;font-weight:900;margin:8px 0 8px;letter-spacing:-.03em;overflow-wrap:anywhere;}
        .heroText{max-width:640px;color:var(--home-muted);line-height:1.55;font-size:14px;overflow-wrap:anywhere;}
        .actionRow{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;}
        .btn{border:1px solid var(--home-stroke);color:var(--home-text);background:rgba(255,255,255,.04);border-radius:14px;padding:12px 15px;font-weight:800;cursor:pointer;transition:transform .12s ease, border-color .12s ease, background .12s ease;flex-shrink:0;}
        .btn:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.07);}
        .btn.primary{background:linear-gradient(90deg, rgba(56,242,255,.16), rgba(157,124,255,.16));border-color:rgba(56,242,255,.28);}
        .heroAside{padding:20px;display:flex;flex-direction:column;gap:14px;min-width:0;}
        .statusCard{padding:16px;border-radius:18px;background:var(--home-panel-2);border:1px solid rgba(255,255,255,.06);min-width:0;}
        .statusValue{margin-top:8px;font-size:24px;font-weight:900;overflow-wrap:anywhere;}
        .statusSub{margin-top:6px;color:var(--home-muted);font-size:13px;overflow-wrap:anywhere;}
        .chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:6px 10px;border-radius:999px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:var(--home-text);flex-shrink:0;}
        .chip.cyan{border-color:rgba(56,242,255,.28);color:var(--home-cyan);} .chip.violet{border-color:rgba(157,124,255,.26);color:#c3b0ff;} .chip.amber{border-color:rgba(255,205,87,.26);color:var(--home-amber);} .chip.neutral{color:var(--home-muted);}
        .statsGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px;} @media (max-width:980px){.statsGrid{grid-template-columns:repeat(2,minmax(0,1fr));}} @media (max-width:600px){.statsGrid{grid-template-columns:1fr;}}
        .statCard{padding:18px;border-radius:22px;border:1px solid var(--home-stroke);background:var(--home-panel);min-width:0;}.statValue{margin-top:10px;font-size:28px;font-weight:900;letter-spacing:-.02em;overflow-wrap:anywhere;}.statHint{margin-top:8px;color:var(--home-muted);font-size:13px;overflow-wrap:anywhere;}
        .mainGrid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:16px;margin-bottom:16px;align-items:start;} .mainGrid > *{min-width:0;} @media (max-width:980px){.mainGrid{grid-template-columns:1fr;}}
        .section{padding:20px;min-width:0;}.sectionHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;min-width:0;} @media (max-width:640px){.sectionHeader{flex-direction:column;align-items:stretch;}.sectionHeader .btn{width:100%;}}
        .sectionTitle{margin-top:6px;font-size:24px;line-height:1.08;font-weight:900;letter-spacing:-.02em;overflow-wrap:anywhere;}.sectionText{margin-top:6px;color:var(--home-muted);line-height:1.5;font-size:14px;max-width:620px;overflow-wrap:anywhere;}
        .campaignStack{display:grid;gap:22px;}.campaignGroup{display:grid;gap:12px;}.campaignGroupTitle{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--home-dim);} .campaignListCompact{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;} @media (max-width:900px){.campaignListCompact{grid-template-columns:1fr;}}
        .campaignCompact{padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);display:grid;gap:10px;min-width:0;} .campaignCompactTop{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;min-width:0;} .campaignCompactTitle{font-size:16px;font-weight:800;line-height:1.2;overflow-wrap:anywhere;} .campaignCompactDesc{color:var(--home-muted);font-size:13px;line-height:1.45;} .campaignCompactMeta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;color:var(--home-muted);font-size:12px;}
        .emptyState{padding:18px;border-radius:18px;border:1px dashed rgba(255,255,255,.12);background:rgba(255,255,255,.02);min-width:0;}.emptyStateTitle{font-size:18px;font-weight:800;overflow-wrap:anywhere;word-break:break-word;}.emptyStateText{margin-top:8px;color:var(--home-muted);line-height:1.5;font-size:14px;overflow-wrap:anywhere;word-break:break-word;}
        .sideStack{display:grid;gap:16px;min-width:0;width:100%;}.obsList{display:grid;gap:12px;min-width:0;}.obsCard{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);min-width:0;} .obsTop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;min-width:0;} .obsTitle{margin-top:8px;font-size:16px;font-weight:800;overflow-wrap:anywhere;word-break:break-word;} .obsMeta{margin-top:8px;color:var(--home-muted);font-size:13px;overflow-wrap:anywhere;word-break:break-word;} .tagRow{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
        .telemetryGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0;} @media (max-width:560px){.telemetryGrid{grid-template-columns:1fr;}}
        .telemetryCard{padding:16px;border-radius:18px;border:1px solid var(--home-stroke);background:var(--home-panel);min-width:0;min-height:148px;display:flex;flex-direction:column;justify-content:flex-start;} .telemetryCard.compact{min-height:132px;} .telemetryValue{margin-top:10px;font-size:clamp(18px,2.2vw,22px);line-height:1.08;font-weight:900;overflow-wrap:anywhere;word-break:break-word;} .telemetrySub{margin-top:8px;font-size:13px;line-height:1.4;color:var(--home-muted);overflow-wrap:anywhere;word-break:break-word;}
        @media (max-width:820px){.telemetryCard{min-height:132px;padding:14px;} .telemetryValue{font-size:clamp(16px,4.6vw,20px);} .telemetrySub{font-size:12px;}}
        .footerAction{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;}.loadingText{color:var(--home-muted);font-size:14px;}.warning{margin-top:10px;color:var(--home-red);font-size:13px;}
      `}</style>

      <div className="homeContainer">
        <section className="hero">
          <div className="panel heroMain">
            <div className="heroTop">
              <div className="brandWrap">
                <div className="brandMark" />
                <div>
                  <div className="eyebrow">Helvarix Global Array</div>
                  <div className="heroTitle">Operations overview</div>
                  <div className="heroText">
                    Active campaigns, recent network submissions, and localized observing conditions
                    from your saved profile location.
                  </div>
                </div>
              </div>

              <Chip tone="cyan">{sessionUserId ? "Authenticated" : "Public View"}</Chip>
            </div>

            <div className="actionRow">
              <button className="btn primary" onClick={() => navigate("/submit")}>Submit Observation</button>
              <button className="btn" onClick={() => navigate("/collective")}>Open Collective</button>
              <button className="btn" onClick={() => navigate("/array")}>Open Array</button>
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
              <div className="statusSub">Campaigns, submissions, and local conditions loaded from live data sources.</div>
            </div>
          </div>
        </section>

        <section className="statsGrid">
          <StatCard label="Observation Index" value={String(profile?.observation_index ?? observationCount ?? 0)} hint="Profile score currently stored for your account." />
          <StatCard label="Campaign Impact" value={String(profile?.campaign_impact ?? 0)} hint="Campaign-weighted contribution across the array." />
          <StatCard label="Active Streak" value={`${profile?.streak_days ?? 0}d`} hint="Consecutive days with submitted activity." />
          <StatCard label="Network Feed" value={`${recentObservations.length}`} hint="Most recent observations surfaced on this page." />
        </section>

        <section className="mainGrid">
          <div className="panel section">
            <div className="sectionHeader">
              <div>
                <div className="eyebrow">Campaigns</div>
                <div className="sectionTitle">All active campaigns</div>
                <div className="sectionText">Public objectives and Research Collective assignments are listed here from the live campaigns table.</div>
              </div>
              <button className="btn" onClick={() => navigate("/collective")}>Open Collective</button>
            </div>

            <div className="campaignStack">
              <div className="campaignGroup">
                <div className="campaignGroupTitle">Public layer</div>
                {publicCampaigns.length === 0 ? (
                  <div className="emptyState">
                    <div className="emptyStateTitle">No active public campaigns</div>
                    <div className="emptyStateText">The home page is not receiving any campaigns classified as daily, weekly, or global.</div>
                  </div>
                ) : (
                  <div className="campaignListCompact">
                    {publicCampaigns.map((campaign) => (
                      <div className="campaignCompact" key={campaign.id}>
                        <div className="campaignCompactTop">
                          <div className="campaignCompactTitle">{campaign.title}</div>
                          <Chip tone={cadenceTone(campaign.cadence)}>{campaign.cadence}</Chip>
                        </div>
                        <div className="campaignCompactDesc">{campaign.description}</div>
                        <div className="campaignCompactMeta">
                          <div><div className="eyebrow">Window</div><div>{formatDateRange(campaign.startAt, campaign.endAt)}</div></div>
                          <div><div className="eyebrow">Ends</div><div>{formatEndsIn(campaign.endAt)}</div></div>
                          <div><div className="eyebrow">Target</div><div>{campaign.targetType ?? "General"}</div></div>
                          <div><div className="eyebrow">Participants</div><div>{campaign.participantCount}</div></div>
                        </div>
                        <Progress value={campaign.progress} tone={cadenceTone(campaign.cadence)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="campaignGroup">
                <div className="campaignGroupTitle">Research Collective</div>
                {researchCampaigns.length === 0 ? (
                  <div className="emptyState">
                    <div className="emptyStateTitle">No active research campaigns</div>
                    <div className="emptyStateText">Subscriber-only campaigns will appear here when active.</div>
                  </div>
                ) : (
                  <div className="campaignListCompact">
                    {researchCampaigns.map((campaign) => (
                      <div className="campaignCompact" key={campaign.id}>
                        <div className="campaignCompactTop">
                          <div className="campaignCompactTitle">{campaign.title}</div>
                          <Chip tone="amber">Research</Chip>
                        </div>
                        <div className="campaignCompactDesc">{campaign.description}</div>
                        <div className="campaignCompactMeta">
                          <div><div className="eyebrow">Window</div><div>{formatDateRange(campaign.startAt, campaign.endAt)}</div></div>
                          <div><div className="eyebrow">Ends</div><div>{formatEndsIn(campaign.endAt)}</div></div>
                          <div><div className="eyebrow">Target</div><div>{campaign.targetType ?? "Research"}</div></div>
                          <div><div className="eyebrow">Participants</div><div>{campaign.participantCount}</div></div>
                        </div>
                        <Progress value={campaign.progress} tone="amber" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {campaignError ? <div className="warning">{campaignError}</div> : null}
            </div>
          </div>

          <div className="sideStack">
            <div className="panel section">
              <div className="sectionHeader">
                <div>
                  <div className="eyebrow">Recent Observations</div>
                  <div className="sectionTitle">Latest network activity</div>
                </div>
                <button className="btn" onClick={() => navigate("/submit")}>Add New</button>
              </div>

              {loading ? (
                <div className="loadingText">Loading recent observations…</div>
              ) : recentObservations.length > 0 ? (
                <div className="obsList">
                  {recentObservations.map((observation) => (
                    <div className="obsCard" key={observation.id}>
                      <div className="obsTop">
                        <Chip tone="cyan">{(observation.mode ?? "Unknown").toUpperCase()}</Chip>
                        <div className="eyebrow">{new Date(observation.created_at).toLocaleString()}</div>
                      </div>
                      <div className="obsTitle">{observation.target ?? "Unspecified Target"}</div>
                      <div className="obsMeta">Contributor: {observation.user_id === sessionUserId ? "You" : "Network Member"}</div>
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
                  <div className="emptyStateText">Once observations are submitted, they will appear here.</div>
                </div>
              )}
            </div>

            <div className="panel section">
              <div className="sectionHeader">
                <div>
                  <div className="eyebrow">Sector Readiness</div>
                  <div className="sectionTitle">Localized sky conditions</div>
                </div>
                <button className="btn" onClick={() => navigate("/telemetry")}>Open Telemetry</button>
              </div>

              <div className="telemetryGrid">
                <TelemetryCard label="Sky State" value={telemetryLoading ? "Loading…" : telemetry?.skyState ?? "UNKNOWN"} hint="Computed from current solar altitude." />
                <TelemetryCard label="Weather" value={telemetryLoading ? "Loading…" : telemetry?.weatherSummary ?? "Unavailable"} hint={telemetryLoading ? "Loading current conditions." : telemetry?.temperatureLabel ?? "Temperature unavailable"} />
                <TelemetryCard label="Cloud Cover" value={telemetryLoading ? "Loading…" : telemetry?.cloudCoverLabel ?? "Unavailable"} hint="Current cloud cover from forecast data." />
                <TelemetryCard label="Visibility" value={telemetryLoading ? "Loading…" : telemetry?.visibilityLabel ?? "Unavailable"} hint="Hourly visibility estimate for your location." />
                <TelemetryCard label="Wind" value={telemetryLoading ? "Loading…" : telemetry?.windLabel ?? "Unavailable"} hint="Current surface wind speed." compact />
                <TelemetryCard label="Precipitation" value={telemetryLoading ? "Loading…" : telemetry?.precipitationLabel ?? "Unavailable"} hint="Hourly precipitation probability." compact />
                <TelemetryCard label="Sun Window" value={telemetryLoading ? "Loading…" : telemetry?.sunWindowLabel ?? "Unavailable"} hint="Sunset / sunrise at your saved location." />
                <TelemetryCard label="Moon" value={telemetryLoading ? "Loading…" : telemetry?.moonLabel ?? "Unavailable"} hint="Current phase and illumination." />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
