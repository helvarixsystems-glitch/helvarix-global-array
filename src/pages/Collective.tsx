import { useEffect, useMemo, useState } from "react";
import { openCustomerPortal, startCheckout } from "../lib/stripe";
import { supabase } from "../lib/supabaseClient";

type SessionUser = {
  id: string;
  email: string | null;
};

type ProfileRecord = Record<string, any> | null;

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

type Coordinates = {
  latitude: number;
  longitude: number;
};

const STRIPE_PRICE_ID =
  (import.meta as any)?.env?.VITE_STRIPE_COLLECTIVE_PRICE_ID ||
  (import.meta as any)?.env?.VITE_STRIPE_PRICE_ID ||
  "REPLACE_WITH_STRIPE_PRICE_ID";

const SOLAR_GOLD = "#f2bf57";

function formatClock(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocationLabel(profile: ProfileRecord, coordsLabel: string | null) {
  const city = String(profile?.city ?? "").trim();
  const country = String(profile?.country ?? "").trim();
  const parts = [city, country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return coordsLabel || "Location not set";
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function generateAlias(seed: string) {
  const prefixes = [
    "Aurora",
    "Vector",
    "Helio",
    "Nova",
    "Zenith",
    "Orion",
    "Polar",
    "Echo",
    "Vanta",
    "Lumen",
    "Apex",
    "Atlas",
    "Crux",
    "Signal",
  ];
  const suffixes = [
    "Array",
    "Relay",
    "Observer",
    "Beacon",
    "Scope",
    "Node",
    "Transit",
    "Emitter",
    "Tracer",
    "Axis",
    "Watch",
    "Vector",
    "Drift",
    "Arc",
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const prefix = prefixes[hash % prefixes.length];
  const suffix = suffixes[(hash >> 4) % suffixes.length];
  const code = String((hash % 9000) + 1000);

  return `${prefix} ${suffix} ${code}`;
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
  if (code == null) return "Awaiting conditions";
  if (code === 0) return "Clear sky";
  if ([1, 2].includes(code)) return "Mostly clear";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Variable conditions";
}

function getObservingRating(weather: WeatherSnapshot) {
  let score = 100;

  if (weather.cloudCover != null) score -= weather.cloudCover * 0.55;
  if (weather.precipitationProbability != null) score -= weather.precipitationProbability * 0.35;
  if (weather.windKph != null) score -= Math.min(weather.windKph, 50) * 0.8;
  if (weather.visibilityKm != null) score += Math.min(weather.visibilityKm, 20) * 0.7;

  const moonFraction = getMoonPhaseFraction(new Date());
  score -= getMoonIlluminationPercent(moonFraction) * 0.1;

  const bounded = Math.max(0, Math.min(100, Math.round(score)));

  if (bounded >= 82) return { score: bounded, label: "Excellent", tone: "good" as const };
  if (bounded >= 64) return { score: bounded, label: "Strong", tone: "good" as const };
  if (bounded >= 44) return { score: bounded, label: "Mixed", tone: "warn" as const };
  return { score: bounded, label: "Poor", tone: "bad" as const };
}

async function geocodePlace(query: string): Promise<Coordinates | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=1&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Unable to geocode saved location.");
  const json = await res.json();
  const result = json?.results?.[0];
  if (!result) return null;

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
  };
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
  if (!sunriseRes.ok) throw new Error("Unable to load sunrise data.");

  const forecast = await forecastRes.json();
  const solar = await sunriseRes.json();

  const current = forecast?.current ?? {};
  const firstHourlyIndex = 0;
  const hourly = forecast?.hourly ?? {};

  return {
    temperatureC:
      typeof current.temperature_2m === "number" ? current.temperature_2m : null,
    windKph:
      typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    cloudCover:
      typeof current.cloud_cover === "number" ? current.cloud_cover : null,
    precipitationProbability:
      typeof hourly?.precipitation_probability?.[firstHourlyIndex] === "number"
        ? hourly.precipitation_probability[firstHourlyIndex]
        : null,
    visibilityKm:
      typeof hourly?.visibility?.[firstHourlyIndex] === "number"
        ? hourly.visibility[firstHourlyIndex] / 1000
        : null,
    sunriseIso: solar?.results?.sunrise ?? null,
    sunsetIso: solar?.results?.sunset ?? null,
    weatherCode:
      typeof current.weather_code === "number" ? current.weather_code : null,
  };
}

export default function Collective() {
  const [loading, setLoading] = useState(true);
  const [busyCheckout, setBusyCheckout] = useState(false);
  const [busyPortal, setBusyPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ProfileRecord>(null);
  const [isPro, setIsPro] = useState(false);

  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [coordsLabel, setCoordsLabel] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;
        if (!user) throw new Error("You must be signed in to access Collective.");

        if (!active) return;

        setSessionUser({
          id: user.id,
          email: user.email ?? null,
        });

        const { data: row, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!active) return;

        const nextProfile = (row as ProfileRecord) ?? null;
        setProfile(nextProfile);
        setIsPro(Boolean(nextProfile?.is_pro));

        const params = new URLSearchParams(window.location.search);
        if (params.get("success") === "1") {
          setNotice("Membership activated. Your Collective access is now live.");
          if (!nextProfile?.is_pro) {
            setIsPro(true);
          }
        } else if (params.get("canceled") === "1") {
          setNotice("Checkout was canceled. Your account remains unchanged.");
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Unable to load Collective.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPage();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveObservatoryContext() {
      if (!sessionUser) return;

      setWeatherLoading(true);

      try {
        let nextCoords: Coordinates | null = null;
        let label: string | null = null;

        if (typeof window !== "undefined" && "geolocation" in navigator) {
          nextCoords = await new Promise<Coordinates | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (position) =>
                resolve({
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                }),
              () => resolve(null),
              {
                enableHighAccuracy: false,
                timeout: 7000,
                maximumAge: 10 * 60 * 1000,
              }
            );
          });

          if (nextCoords) {
            label = `${nextCoords.latitude.toFixed(2)}°, ${nextCoords.longitude.toFixed(2)}°`;
          }
        }

        if (!nextCoords) {
          const query = [String(profile?.city ?? "").trim(), String(profile?.country ?? "").trim()]
            .filter(Boolean)
            .join(", ");

          if (query) {
            nextCoords = await geocodePlace(query);
            label = query;
          }
        }

        if (cancelled) return;

        setCoords(nextCoords);
        setCoordsLabel(label);

        if (nextCoords) {
          const conditions = await fetchWeather(nextCoords);
          if (cancelled) return;
          setWeather(conditions);
        } else {
          setWeather(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError((current) => current ?? err?.message ?? "Unable to load observatory conditions.");
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    resolveObservatoryContext();

    return () => {
      cancelled = true;
    };
  }, [profile, sessionUser]);

  async function handleUpgrade() {
    setBusyCheckout(true);
    setError(null);

    try {
      if (!STRIPE_PRICE_ID || STRIPE_PRICE_ID === "REPLACE_WITH_STRIPE_PRICE_ID") {
        throw new Error(
          "Set VITE_STRIPE_COLLECTIVE_PRICE_ID in Cloudflare Pages before enabling checkout."
        );
      }

      await startCheckout(STRIPE_PRICE_ID);
    } catch (err: any) {
      setError(err?.message ?? "Unable to start checkout.");
    } finally {
      setBusyCheckout(false);
    }
  }

  async function handlePortal() {
    setBusyPortal(true);
    setError(null);

    try {
      await openCustomerPortal();
    } catch (err: any) {
      setError(err?.message ?? "Unable to open billing portal.");
    } finally {
      setBusyPortal(false);
    }
  }

  const displayName = useMemo(() => {
    const saved = String(profile?.display_name ?? "").trim();
    if (saved) return saved;
    return sessionUser ? generateAlias(sessionUser.id) : "Array Operator";
  }, [profile, sessionUser]);

  const locationLabel = useMemo(
    () => formatLocationLabel(profile, coordsLabel),
    [profile, coordsLabel]
  );

  const observationIndex = toNumber(profile?.observation_index);
  const campaignImpact = toNumber(profile?.campaign_impact);
  const moonFraction = getMoonPhaseFraction(new Date());
  const moonPhaseLabel = getMoonPhaseLabel(moonFraction);
  const moonIllumination = getMoonIlluminationPercent(moonFraction);
  const rating = getObservingRating(
    weather ?? {
      temperatureC: null,
      windKph: null,
      cloudCover: null,
      precipitationProbability: null,
      visibilityKm: null,
      sunriseIso: null,
      sunsetIso: null,
      weatherCode: null,
    }
  );

  const premiumTools = [
    {
      title: "Observing Window",
      value: weather ? `${rating.label} · ${rating.score}/100` : "Awaiting conditions",
      body:
        "Scores current cloud cover, wind, precipitation risk, visibility, and moonlight so paying operators can decide whether a session is worth setting up.",
    },
    {
      title: "Site Conditions",
      value:
        weather && weather.temperatureC != null
          ? `${Math.round(weather.temperatureC)}°C · ${getWeatherSummary(weather.weatherCode)}`
          : "No active weather snapshot",
      body:
        "Live local conditions for the active observing region, designed to support setup planning before dark.",
    },
    {
      title: "Darkness Timing",
      value:
        weather?.sunsetIso || weather?.sunriseIso
          ? `${formatClock(weather.sunsetIso)} sunset · ${formatClock(weather.sunriseIso)} sunrise`
          : "Set a location to unlock",
      body:
        "Fast solar timing so users can estimate when to begin visual sessions, imaging runs, calibration, and shutdown.",
    },
    {
      title: "Moonlight Impact",
      value: `${moonPhaseLabel} · ${moonIllumination}% illuminated`,
      body:
        "Quick lunar brightness reference for deep-sky planning, narrowband nights, and public outreach sessions.",
    },
    {
      title: "Team Operations",
      value: isPro ? "Enabled for subscribers" : "Locked",
      body:
        "Teams can be reserved for paid members, letting them coordinate observing runs, private collaboration, and group campaigns.",
    },
    {
      title: "Public Identity Boost",
      value: isPro ? "Solar gold public badge" : "Preview only",
      body:
        "Subscribers get premium visual treatment on public-facing surfaces, including name accents and upgraded identity presentation.",
    },
  ];

  return (
    <div className="pageStack collectivePage">
      <style>{`
        .collectivePage .heroPanel.collectiveHero{
          overflow:hidden;
          position:relative;
          padding:28px;
          background:
            radial-gradient(circle at top right, rgba(242, 191, 87, 0.14), transparent 28%),
            radial-gradient(circle at top left, rgba(92, 214, 255, 0.10), transparent 32%),
            linear-gradient(180deg, rgba(15, 24, 46, 0.96), rgba(9, 16, 31, 0.92));
        }
        .collectiveHero::after{
          content:"";
          position:absolute;
          inset:auto -8% -30% auto;
          width:320px;
          height:320px;
          border-radius:50%;
          background:radial-gradient(circle, rgba(242,191,87,0.18), transparent 65%);
          pointer-events:none;
        }
        .collectiveHeroGrid{
          display:grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap:18px;
          align-items:stretch;
          position:relative;
          z-index:1;
        }
        .collectiveKicker{
          color:${SOLAR_GOLD};
          font-size:12px;
          letter-spacing:0.28em;
          text-transform:uppercase;
          font-weight:800;
        }
        .collectiveLead{
          max-width:780px;
          margin-top:14px;
          color:var(--muted);
          line-height:1.7;
        }
        .collectiveHeroMeta{
          display:flex;
          flex-wrap:wrap;
          gap:12px;
          margin-top:18px;
        }
        .goldBadge{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:10px 14px;
          border-radius:999px;
          border:1px solid rgba(242, 191, 87, 0.32);
          background:rgba(242, 191, 87, 0.10);
          color:#ffe4a5;
          font-weight:700;
        }
        .collectiveStatusCard{
          min-height:100%;
          display:grid;
          gap:16px;
          padding:22px;
          border-radius:24px;
          border:1px solid rgba(242, 191, 87, 0.18);
          background:linear-gradient(180deg, rgba(15, 24, 46, 0.88), rgba(9, 14, 28, 0.94));
        }
        .collectiveStatusTop{
          display:flex;
          justify-content:space-between;
          gap:16px;
          align-items:flex-start;
        }
        .collectivePrice{
          font-size:34px;
          font-weight:800;
          line-height:1;
        }
        .collectivePrice small{
          font-size:14px;
          color:var(--muted);
          font-weight:600;
        }
        .collectiveMiniList{
          display:grid;
          gap:10px;
        }
        .collectiveMiniRow{
          display:flex;
          justify-content:space-between;
          gap:16px;
          padding:12px 14px;
          border-radius:14px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }
        .collectiveMiniRow span{
          color:var(--muted);
        }
        .collectiveMetricGrid{
          display:grid;
          grid-template-columns:repeat(4, minmax(0,1fr));
          gap:18px;
        }
        .collectiveMetricCard{
          padding:18px;
          border-radius:18px;
          background:var(--panel-soft);
          border:1px solid rgba(92, 214, 255, 0.12);
        }
        .collectiveMetricValue{
          margin-top:8px;
          font-size:28px;
          font-weight:800;
        }
        .collectiveTwoCol{
          display:grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
          gap:18px;
        }
        .collectiveToolsGrid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0,1fr));
          gap:14px;
          margin-top:18px;
        }
        .collectiveToolCard{
          padding:18px;
          border-radius:18px;
          background:rgba(255,255,255,0.035);
          border:1px solid rgba(255,255,255,0.07);
          display:grid;
          gap:8px;
        }
        .collectiveToolCard .toolValue{
          font-size:18px;
          font-weight:800;
        }
        .collectiveToolCard .toolBody{
          color:var(--muted);
          line-height:1.6;
        }
        .toolLock{
          color:#ffcf78;
        }
        .toolLive{
          color:#94f5c7;
        }
        .publicIdentityPreview{
          display:grid;
          gap:14px;
          padding:18px;
          border-radius:18px;
          background:rgba(8, 14, 30, 0.72);
          border:1px solid rgba(255,255,255,0.06);
        }
        .publicIdentityCard{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
          padding:16px 18px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,0.07);
          background:linear-gradient(180deg, rgba(14, 22, 42, 0.9), rgba(9, 14, 29, 0.9));
        }
        .identityName{
          font-size:22px;
          font-weight:800;
        }
        .identityName.solarGoldText{
          color:${SOLAR_GOLD};
          text-shadow:0 0 24px rgba(242,191,87,0.18);
        }
        .identityMeta{
          margin-top:6px;
          color:var(--muted);
          display:flex;
          flex-wrap:wrap;
          gap:12px;
          font-size:14px;
        }
        .identityChip{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:10px 12px;
          border-radius:999px;
          border:1px solid rgba(242,191,87,0.26);
          background:rgba(242,191,87,0.08);
          color:#ffe4a5;
          font-weight:700;
        }
        .collectiveTimeline{
          display:grid;
          gap:12px;
          margin-top:18px;
        }
        .timelineRow{
          display:grid;
          grid-template-columns:28px 1fr;
          gap:12px;
        }
        .timelineDot{
          width:28px;
          height:28px;
          border-radius:999px;
          display:flex;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(242,191,87,0.26);
          background:rgba(242,191,87,0.10);
          color:#ffe4a5;
          font-size:12px;
          font-weight:800;
        }
        .timelineCard{
          padding:14px 16px;
          border-radius:16px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }
        .timelineCard strong{
          display:block;
          margin-bottom:6px;
        }
        .collectiveHelperNote{
          margin-top:14px;
          padding:14px 16px;
          border-radius:14px;
          border:1px dashed rgba(242,191,87,0.22);
          background:rgba(242,191,87,0.06);
          color:#ffe9b7;
          line-height:1.6;
        }
        @media (max-width: 1024px){
          .collectiveHeroGrid,
          .collectiveTwoCol{
            grid-template-columns:1fr;
          }
          .collectiveMetricGrid,
          .collectiveToolsGrid{
            grid-template-columns:repeat(2, minmax(0,1fr));
          }
        }
        @media (max-width: 720px){
          .collectiveMetricGrid,
          .collectiveToolsGrid{
            grid-template-columns:1fr;
          }
          .publicIdentityCard{
            flex-direction:column;
            align-items:flex-start;
          }
        }
      `}</style>

      <section className="heroPanel collectiveHero">
        <div className="collectiveHeroGrid">
          <div>
            <div className="collectiveKicker">PREMIUM MEMBERSHIP</div>
            <h1 className="pageTitle">Helvarix Research Collective</h1>
            <p className="collectiveLead">
              A premium operator layer built for serious contributors. Collective members unlock
              local observing intelligence, private teams, premium public identity treatment,
              faster session planning, and subscription-aware tooling that fits your astronomy UI.
            </p>

            <div className="collectiveHeroMeta">
              <span className="goldBadge">{isPro ? "COLLECTIVE ACTIVE" : "COLLECTIVE LOCKED"}</span>
              <span className="statusBadge">Public solar-gold identity for paying members</span>
              <span className="statusBadge">Weather + location aware observing tools</span>
            </div>
          </div>

          <aside className="collectiveStatusCard">
            <div className="collectiveStatusTop">
              <div>
                <div className="sectionKicker">CURRENT PLAN</div>
                <div className="collectivePrice">
                  $12<small>/month</small>
                </div>
              </div>
              <span className="statusBadge">{isPro ? "Subscriber" : "Free account"}</span>
            </div>

            <div className="collectiveMiniList">
              <div className="collectiveMiniRow">
                <span>Operator</span>
                <strong>{displayName}</strong>
              </div>
              <div className="collectiveMiniRow">
                <span>Region</span>
                <strong>{locationLabel}</strong>
              </div>
              <div className="collectiveMiniRow">
                <span>Billing</span>
                <strong>{sessionUser?.email ?? "Signed in"}</strong>
              </div>
            </div>

            <div className="buttonRow" style={{ marginTop: 0 }}>
              {isPro ? (
                <button
                  className="primaryBtn"
                  type="button"
                  onClick={handlePortal}
                  disabled={busyPortal}
                >
                  {busyPortal ? "Opening billing…" : "Manage membership"}
                </button>
              ) : (
                <button
                  className="primaryBtn"
                  type="button"
                  onClick={handleUpgrade}
                  disabled={busyCheckout}
                >
                  {busyCheckout ? "Opening Stripe…" : "Upgrade to Collective"}
                </button>
              )}

              {!isPro ? (
                <button className="ghostBtn" type="button" onClick={handlePortal} disabled={busyPortal}>
                  Billing portal
                </button>
              ) : null}
            </div>

            <div className="helperText">
              Set <code>VITE_STRIPE_COLLECTIVE_PRICE_ID</code> in Cloudflare Pages and point it to
              your recurring Stripe price before going live.
            </div>
          </aside>
        </div>
      </section>

      {loading ? (
        <section className="panel">
          <div className="stateTitle">Loading Collective…</div>
          <div className="stateText">
            Restoring operator status, membership state, and observatory context.
          </div>
        </section>
      ) : null}

      {notice ? <div className="alert info">{notice}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">MEMBERSHIP SNAPSHOT</div>
            <h2 className="sectionTitle">Status-aware premium surface</h2>
          </div>
          <span className="statusBadge">{isPro ? "Unlocked" : "Preview mode"}</span>
        </div>

        <div className="collectiveMetricGrid">
          <div className="collectiveMetricCard">
            <div className="metricLabel">Observation Index</div>
            <div className="collectiveMetricValue">{observationIndex.toLocaleString()}</div>
          </div>
          <div className="collectiveMetricCard">
            <div className="metricLabel">Campaign Impact</div>
            <div className="collectiveMetricValue">{campaignImpact.toLocaleString()}</div>
          </div>
          <div className="collectiveMetricCard">
            <div className="metricLabel">Moon phase</div>
            <div className="collectiveMetricValue" style={{ fontSize: 22 }}>
              {moonPhaseLabel}
            </div>
          </div>
          <div className="collectiveMetricCard">
            <div className="metricLabel">Observing score</div>
            <div className="collectiveMetricValue">
              {weather ? `${rating.score}/100` : weatherLoading ? "…" : "—"}
            </div>
          </div>
        </div>
      </section>

      <div className="collectiveTwoCol">
        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">PREMIUM TOOLS</div>
              <h2 className="sectionTitle">Location-driven operator toolkit</h2>
              <p className="sectionText" style={{ marginTop: 10 }}>
                This section is designed to feel useful even before upgrade, while clearly putting
                the best tools behind the paywall.
              </p>
            </div>
            <span className="statusBadge">{weatherLoading ? "Syncing weather…" : "Live context"}</span>
          </div>

          <div className="collectiveToolsGrid">
            {premiumTools.map((tool) => (
              <div key={tool.title} className="collectiveToolCard">
                <div className="fieldLabel">{tool.title}</div>
                <div className={`toolValue ${isPro ? "toolLive" : "toolLock"}`}>{tool.value}</div>
                <div className="toolBody">{tool.body}</div>
              </div>
            ))}
          </div>

          <div className="collectiveTimeline">
            <div className="timelineRow">
              <div className="timelineDot">1</div>
              <div className="timelineCard">
                <strong>Free operator</strong>
                Can view the Collective pitch, see premium previews, and start Stripe checkout.
              </div>
            </div>
            <div className="timelineRow">
              <div className="timelineDot">2</div>
              <div className="timelineCard">
                <strong>Subscription active</strong>
                Stripe webhook marks <code>profiles.is_pro = true</code>, which unlocks the premium
                tools and membership UI on this page.
              </div>
            </div>
            <div className="timelineRow">
              <div className="timelineDot">3</div>
              <div className="timelineCard">
                <strong>Public upgrade treatment</strong>
                Paying members should render their public-facing names with the same solar-gold
                treatment shown in the preview card on the right.
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">PUBLIC IDENTITY</div>
              <h2 className="sectionTitle">Solar-gold subscriber preview</h2>
            </div>
            <span className="statusBadge">{isPro ? "Applied here" : "Preview only"}</span>
          </div>

          <div className="publicIdentityPreview">
            <div className="publicIdentityCard">
              <div>
                <div className={`identityName ${isPro ? "solarGoldText" : ""}`}>{displayName}</div>
                <div className="identityMeta">
                  <span>{String(profile?.callsign ?? "No callsign set") || "No callsign set"}</span>
                  <span>{locationLabel}</span>
                  <span>{isPro ? "Collective member" : "Standard operator"}</span>
                </div>
              </div>
              {isPro ? <div className="identityChip">SOLAR GOLD MEMBER</div> : null}
            </div>

            <div className="dataList compactList">
              <div className="dataRow">
                <span>Weather now</span>
                <strong>
                  {weather
                    ? `${getWeatherSummary(weather.weatherCode)}`
                    : weatherLoading
                    ? "Loading…"
                    : "Unavailable"}
                </strong>
              </div>
              <div className="dataRow">
                <span>Cloud cover</span>
                <strong>
                  {weather?.cloudCover != null ? `${Math.round(weather.cloudCover)}%` : "—"}
                </strong>
              </div>
              <div className="dataRow">
                <span>Wind speed</span>
                <strong>
                  {weather?.windKph != null ? `${Math.round(weather.windKph)} km/h` : "—"}
                </strong>
              </div>
              <div className="dataRow">
                <span>Visibility</span>
                <strong>
                  {weather?.visibilityKm != null ? `${weather.visibilityKm.toFixed(1)} km` : "—"}
                </strong>
              </div>
              <div className="dataRow">
                <span>Sunset / Sunrise</span>
                <strong>
                  {weather?.sunsetIso || weather?.sunriseIso
                    ? `${formatClock(weather.sunsetIso)} / ${formatClock(weather.sunriseIso)}`
                    : "—"}
                </strong>
              </div>
              <div className="dataRow">
                <span>Moon illumination</span>
                <strong>{moonIllumination}%</strong>
              </div>
            </div>

            <div className="collectiveHelperNote">
              This page can preview the gold treatment, but to make subscriber names show up gold
              everywhere public through the app, mirror this rule in your telemetry rows, public
              profile header, leaderboard cells, and any feed item that renders a user name:
              <br />
              <br />
              <code>
                const isSolarGold = Boolean(profile?.is_pro); className={"{isSolarGold ? 'solarGoldText' : ''}"}
              </code>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
