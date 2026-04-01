import { useEffect, useMemo, useState } from "react";
import { openCustomerPortal } from "../lib/stripe";
import { supabase } from "../lib/supabaseClient";
import { canUserSeeCampaign } from "../lib/campaignAccess";

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
  slot_capacity?: number | null;
  is_limited_entry?: boolean | null;
  priority_rank?: number | null;
};

type CollectiveCampaign = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  targetType: string | null;
  tags: string[];
  accessTier: string | null;
  campaignClass: string;
  slotCapacity: number | null;
  isLimitedEntry: boolean;
  priorityRank: number | null;
  isActive: boolean;
};

type CampaignMembershipRecord = {
  campaign_id: string;
  user_id: string;
  team_id: string | null;
  status: string | null;
};

type CampaignSlotRow = {
  campaign_id: string;
  filled_slots: number;
};

type TeamRecord = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  owner_id: string | null;
  is_private: boolean | null;
  max_members: number | null;
  created_at: string | null;
};

const SOLAR_GOLD = "#f2bf57";
const MONTHLY_PRICE_LABEL = "$15/month";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatClock(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null) {
  if (!value) return "Open";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Open";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startAt: string | null, endAt: string | null) {
  return `${formatDate(startAt)} — ${formatDate(endAt)}`;
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

  if (bounded >= 82) return { score: bounded, label: "Excellent" };
  if (bounded >= 64) return { score: bounded, label: "Strong" };
  if (bounded >= 44) return { score: bounded, label: "Mixed" };
  return { score: bounded, label: "Poor" };
}

function formatLocationLabel(profile: ProfileRecord, coordsLabel: string | null) {
  const city = String(profile?.city ?? "").trim();
  const country = String(profile?.country ?? "").trim();
  const parts = [city, country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return coordsLabel || "Location unavailable";
}

function looksLikeMissingRelation(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("column") ||
    message.includes("not found")
  );
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
  const hourly = forecast?.hourly ?? {};
  const currentTime = String(current.time ?? "");
  const hourTimes: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const hourIndex = Math.max(0, hourTimes.indexOf(currentTime));

  return {
    temperatureC:
      typeof current.temperature_2m === "number" ? current.temperature_2m : null,
    windKph:
      typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    cloudCover:
      typeof current.cloud_cover === "number" ? current.cloud_cover : null,
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

  const [coordsLabel, setCoordsLabel] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [campaigns, setCampaigns] = useState<CollectiveCampaign[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignMembershipsEnabled, setCampaignMembershipsEnabled] = useState(true);
  const [myCampaignMemberships, setMyCampaignMemberships] = useState<Record<string, CampaignMembershipRecord>>({});
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [campaignActionBusy, setCampaignActionBusy] = useState<string | null>(null);

  const [teamsEnabled, setTeamsEnabled] = useState(true);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

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
        setIsPro(Boolean(nextProfile?.guild_access ?? nextProfile?.is_pro));

        const params = new URLSearchParams(window.location.search);
        if (params.get("success") === "1") {
          setNotice("Collective membership activated.");
        } else if (params.get("canceled") === "1") {
          setNotice("Checkout canceled.");
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

    async function resolveContext() {
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

    resolveContext();

    return () => {
      cancelled = true;
    };
  }, [profile, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    loadCampaigns();
    loadCampaignMemberships(sessionUser.id);
    loadTeams(sessionUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, isPro]);

  async function loadCampaigns() {
    setCampaignLoading(true);

    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id,cadence,title,description,start_at,end_at,goal_user,goal_global,tags,is_active,target_type,access_tier,campaign_class,slot_capacity,is_limited_entry,priority_rank"
        )
        .eq("is_active", true)
        .order("priority_rank", { ascending: true, nullsFirst: false })
        .order("start_at", { ascending: false });

      if (error) throw error;

      const rows = ((data as CampaignRow[]) ?? []).map((row) => ({
        id: row.id,
        cadence: (row.cadence ?? "GLOBAL") as CampaignCadence,
        title: row.title ?? "Untitled Campaign",
        description: row.description ?? "Array-wide observation objective.",
        startAt: row.start_at ?? null,
        endAt: row.end_at ?? null,
        targetType: row.target_type ?? null,
        tags: row.tags ?? [],
        accessTier: row.access_tier ?? "free",
        campaignClass: row.campaign_class ?? "public",
        slotCapacity: row.slot_capacity ?? null,
        isLimitedEntry: Boolean(row.is_limited_entry),
        priorityRank: row.priority_rank ?? null,
        isActive: Boolean(row.is_active ?? true),
      }));

      rows.sort((a, b) => {
        if (a.campaignClass !== b.campaignClass) {
          if (a.campaignClass === "public") return -1;
          if (b.campaignClass === "public") return 1;
        }

        const priorityA = a.priorityRank ?? 9999;
        const priorityB = b.priorityRank ?? 9999;
        if (priorityA !== priorityB) return priorityA - priorityB;

        return cadenceSortValue(a.cadence) - cadenceSortValue(b.cadence);
      });

      setCampaigns(rows);
      await loadSlotCounts(rows.map((row) => row.id));
    } catch (err: any) {
      setCampaigns([]);
      setError((current) => current ?? err?.message ?? "Unable to load campaign data.");
    } finally {
      setCampaignLoading(false);
    }
  }

  async function loadSlotCounts(campaignIds: string[]) {
    if (!campaignIds.length) {
      setSlotCounts({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("campaign_memberships")
        .select("campaign_id,status")
        .in("campaign_id", campaignIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { campaign_id: string; status: string | null }[]) {
        if ((row.status ?? "active") !== "active") continue;
        counts[row.campaign_id] = (counts[row.campaign_id] ?? 0) + 1;
      }

      setSlotCounts(counts);
      setCampaignMembershipsEnabled(true);
    } catch (err: any) {
      if (looksLikeMissingRelation(err)) {
        setCampaignMembershipsEnabled(false);
        setSlotCounts({});
      } else {
        setError((current) => current ?? err?.message ?? "Unable to load campaign slot counts.");
      }
    }
  }

  async function loadCampaignMemberships(userId: string) {
    try {
      const { data, error } = await supabase
        .from("campaign_memberships")
        .select("campaign_id,user_id,team_id,status")
        .eq("user_id", userId);

      if (error) throw error;

      const mapped: Record<string, CampaignMembershipRecord> = {};
      for (const row of (data ?? []) as CampaignMembershipRecord[]) {
        mapped[row.campaign_id] = row;
      }

      setMyCampaignMemberships(mapped);
      setCampaignMembershipsEnabled(true);
    } catch (err: any) {
      if (looksLikeMissingRelation(err)) {
        setCampaignMembershipsEnabled(false);
        setMyCampaignMemberships({});
      } else {
        setError((current) => current ?? err?.message ?? "Unable to load your campaign memberships.");
      }
    }
  }

  async function loadTeams(userId: string) {
    setTeamsLoading(true);

    try {
      const { data, error } = await supabase
        .from("team_members")
        .select(
          `
            team_id,
            teams (
              id,
              name,
              slug,
              description,
              owner_id,
              is_private,
              max_members,
              created_at
            )
          `
        )
        .eq("user_id", userId)
        .in("status", ["active", "owner", "accepted"]);

      if (error) throw error;

      const nextTeams =
        (data ?? [])
          .map((row: any) => row.teams)
          .filter(Boolean)
          .reduce((acc: TeamRecord[], team: any) => {
            if (!acc.find((entry) => entry.id === team.id)) {
              acc.push({
                id: team.id,
                name: team.name ?? "Untitled Team",
                slug: team.slug ?? null,
                description: team.description ?? null,
                owner_id: team.owner_id ?? null,
                is_private: team.is_private ?? true,
                max_members: team.max_members ?? null,
                created_at: team.created_at ?? null,
              });
            }
            return acc;
          }, []) ?? [];

      setTeams(nextTeams);
      setTeamsEnabled(true);
    } catch (err: any) {
      if (looksLikeMissingRelation(err)) {
        setTeamsEnabled(false);
        setTeams([]);
      } else {
        setError((current) => current ?? err?.message ?? "Unable to load teams.");
      }
    } finally {
      setTeamsLoading(false);
    }
  }

  async function handleUpgrade() {
    setBusyCheckout(true);
    setError(null);

    try {
      if (!sessionUser) throw new Error("You must be signed in before starting checkout.");

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: sessionUser.id,
          email: sessionUser.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to open checkout right now.");
      }

      if (!data?.url) {
        throw new Error("Checkout URL was not returned.");
      }

      window.location.href = data.url;
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

  async function handleJoinCampaign(campaign: CollectiveCampaign, teamId: string | null = null) {
    if (!sessionUser) return;
    setCampaignActionBusy(`join-${campaign.id}`);
    setError(null);
    setNotice(null);

    try {
      if (!campaignMembershipsEnabled) {
        throw new Error("Campaign membership table is not available yet.");
      }

      if (
        !canUserSeeCampaign(
          {
            access_tier: campaign.accessTier,
            is_active: campaign.isActive,
          },
          {
            guild_access: isPro,
            is_pro: isPro,
          }
        )
      ) {
        throw new Error("This campaign requires Research Collective membership.");
      }

      const filledSlots = slotCounts[campaign.id] ?? 0;
      const isFull =
        campaign.isLimitedEntry &&
        campaign.slotCapacity != null &&
        filledSlots >= campaign.slotCapacity &&
        !myCampaignMemberships[campaign.id];

      if (isFull) {
        throw new Error("This research campaign is already full.");
      }

      const { error } = await supabase.from("campaign_memberships").upsert(
        {
          campaign_id: campaign.id,
          user_id: sessionUser.id,
          team_id: teamId,
          status: "active",
        },
        {
          onConflict: "campaign_id,user_id",
        }
      );

      if (error) throw error;

      setMyCampaignMemberships((current) => ({
        ...current,
        [campaign.id]: {
          campaign_id: campaign.id,
          user_id: sessionUser.id,
          team_id: teamId,
          status: "active",
        },
      }));

      setSlotCounts((current) => {
        const existsAlready = Boolean(myCampaignMemberships[campaign.id]);
        if (existsAlready) return current;
        return {
          ...current,
          [campaign.id]: (current[campaign.id] ?? 0) + 1,
        };
      });

      setNotice(teamId ? "Campaign joined with team assignment." : "Campaign joined.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to join campaign.");
    } finally {
      setCampaignActionBusy(null);
    }
  }

  async function handleLeaveCampaign(campaign: CollectiveCampaign) {
    if (!sessionUser) return;
    setCampaignActionBusy(`leave-${campaign.id}`);
    setError(null);
    setNotice(null);

    try {
      if (!campaignMembershipsEnabled) {
        throw new Error("Campaign membership table is not available yet.");
      }

      const existed = Boolean(myCampaignMemberships[campaign.id]);

      const { error } = await supabase
        .from("campaign_memberships")
        .delete()
        .eq("campaign_id", campaign.id)
        .eq("user_id", sessionUser.id);

      if (error) throw error;

      setMyCampaignMemberships((current) => {
        const next = { ...current };
        delete next[campaign.id];
        return next;
      });

      if (existed) {
        setSlotCounts((current) => ({
          ...current,
          [campaign.id]: Math.max(0, (current[campaign.id] ?? 0) - 1),
        }));
      }

      setNotice("Campaign left.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to leave campaign.");
    } finally {
      setCampaignActionBusy(null);
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

  const observationIndex = toNumber(profile?.observation_index);
  const campaignImpact = toNumber(profile?.campaign_impact);

  const visiblePublicCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => campaign.campaignClass === "public");
  }, [campaigns]);

  const visibleResearchCampaigns = useMemo(() => {
    const allResearch = campaigns
      .filter((campaign) => campaign.campaignClass === "research_collective")
      .sort((a, b) => (a.priorityRank ?? 9999) - (b.priorityRank ?? 9999));

    if (isPro) {
      return allResearch.slice(0, 4);
    }

    return allResearch.slice(0, 4);
  }, [campaigns, isPro]);

  const activeCampaignCount = visiblePublicCampaigns.length + visibleResearchCampaigns.length;

  const toolCards = [
    {
      title: "Observing Window",
      value: weather ? `${rating.label} · ${rating.score}/100` : "Awaiting conditions",
      body: "Local conditions scored for session quality, wind, cloud cover, visibility, and moonlight.",
      locked: false,
    },
    {
      title: "Site Conditions",
      value:
        weather && weather.temperatureC != null
          ? `${Math.round(weather.temperatureC)}°C · ${getWeatherSummary(weather.weatherCode)}`
          : "No active weather snapshot",
      body: "Fast-read environment data for setup, teardown, and imaging decisions.",
      locked: false,
    },
    {
      title: "Darkness Timing",
      value:
        weather?.sunsetIso || weather?.sunriseIso
          ? `${formatClock(weather.sunsetIso)} sunset · ${formatClock(weather.sunriseIso)} sunrise`
          : "Location needed",
      body: "Sunset and sunrise timing for planning observation windows.",
      locked: false,
    },
    {
      title: "Moonlight Impact",
      value: `${moonPhaseLabel} · ${moonIllumination}% illuminated`,
      body: "Useful for deep-sky planning, contrast expectations, and target selection.",
      locked: false,
    },
    {
      title: "Public Campaign Access",
      value: `${visiblePublicCampaigns.length} active`,
      body: "Subscribers still retain full access to all public daily, weekly, and global campaigns.",
      locked: false,
    },
    {
      title: "Research Assignments",
      value: `${visibleResearchCampaigns.length} limited-entry`,
      body: "Research Collective subscribers unlock the premium limited-entry campaign layer.",
      locked: false,
    },
    {
      title: "Team Assignment",
      value: teamsEnabled ? `${teams.length} team${teams.length === 1 ? "" : "s"} available` : "Requires DB table",
      body: "Subscribers can optionally attach a team to a campaign when joining.",
      locked: !teamsEnabled,
    },
    {
      title: "Live Campaign Layer",
      value: `${activeCampaignCount} total`,
      body: "This page now reflects real campaign data instead of static placeholder cards.",
      locked: false,
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
            radial-gradient(circle at top right, rgba(242, 191, 87, 0.13), transparent 28%),
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
          background:radial-gradient(circle, rgba(242,191,87,0.17), transparent 65%);
          pointer-events:none;
        }
        .collectiveHeroGrid{
          display:grid;
          grid-template-columns:minmax(0,1.2fr) minmax(320px,0.8fr);
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
          max-width:820px;
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
          border:1px solid rgba(242,191,87,0.30);
          background:rgba(242,191,87,0.10);
          color:#ffe4a5;
          font-weight:700;
        }
        .collectiveStatusCard{
          min-height:100%;
          display:grid;
          gap:16px;
          padding:22px;
          border-radius:24px;
          border:1px solid rgba(242,191,87,0.16);
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
          margin-left:4px;
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
          background:var(--panel-soft, rgba(255,255,255,0.03));
          border:1px solid rgba(92, 214, 255, 0.12);
        }
        .collectiveMetricValue{
          margin-top:8px;
          font-size:28px;
          font-weight:800;
        }
        .collectiveTwoCol{
          display:grid;
          grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr);
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
        .collectiveToolValue{
          font-size:18px;
          font-weight:800;
        }
        .collectiveToolValue.live{
          color:#94f5c7;
        }
        .collectiveToolValue.locked{
          color:#ffcf78;
        }
        .collectiveToolBody{
          color:var(--muted);
          line-height:1.6;
        }
        .campaignSectionHeader{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
          margin-top:20px;
        }
        .campaignGrid{
          display:grid;
          gap:14px;
          margin-top:18px;
        }
        .campaignCard{
          padding:18px;
          border-radius:18px;
          background:rgba(8, 14, 30, 0.72);
          border:1px solid rgba(255,255,255,0.06);
          display:grid;
          gap:14px;
        }
        .campaignCard.premium{
          border:1px solid rgba(242,191,87,0.22);
          background:
            radial-gradient(circle at top right, rgba(242,191,87,0.08), transparent 32%),
            linear-gradient(180deg, rgba(18, 22, 38, 0.95), rgba(9, 14, 29, 0.92));
        }
        .campaignCard.locked{
          opacity:0.92;
        }
        .campaignTop{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
        }
        .campaignTitle{
          font-size:18px;
          font-weight:800;
        }
        .campaignDesc{
          color:var(--muted);
          line-height:1.7;
        }
        .campaignMetaRow{
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .campaignMetaChip{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 10px;
          border-radius:999px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
          font-size:12px;
          font-weight:800;
          letter-spacing:0.04em;
          text-transform:uppercase;
        }
        .campaignMetaChip.gold{
          border-color:rgba(242,191,87,0.24);
          background:rgba(242,191,87,0.08);
          color:#ffe4a5;
        }
        .campaignMetaChip.full{
          border-color:rgba(255,120,120,0.25);
          background:rgba(255,120,120,0.08);
          color:#ffb3b3;
        }
        .campaignMetaChip.locked{
          border-color:rgba(255,207,120,0.22);
          background:rgba(255,207,120,0.08);
          color:#ffcf78;
        }
        .toneCyan{ color:#7cefff; }
        .toneViolet{ color:#cab3ff; }
        .toneAmber{ color:#ffd07a; }
        .campaignStatRow{
          display:grid;
          grid-template-columns:repeat(4, minmax(0,1fr));
          gap:12px;
        }
        .campaignStat{
          padding:12px 14px;
          border-radius:14px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }
        .campaignStatLabel{
          color:var(--muted);
          font-size:12px;
          text-transform:uppercase;
          letter-spacing:0.06em;
        }
        .campaignStatValue{
          margin-top:6px;
          font-weight:800;
        }
        .campaignActionRow{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
        }
        .campaignAssignSelect{
          min-width:180px;
          padding:11px 12px;
          border-radius:12px;
          background:rgba(255,255,255,0.04);
          color:var(--text);
          border:1px solid rgba(255,255,255,0.08);
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
          border:1px solid rgba(242,191,87,0.24);
          background:rgba(242,191,87,0.08);
          color:#ffe4a5;
          font-weight:700;
        }
        .collectiveDataList{
          display:grid;
          gap:10px;
        }
        .collectiveDataRow{
          display:flex;
          justify-content:space-between;
          gap:16px;
          padding:12px 14px;
          border-radius:14px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }
        .collectiveDataRow span{
          color:var(--muted);
        }
        .sectionHint{
          color:var(--muted);
          line-height:1.6;
          margin-top:10px;
        }
        @media (max-width: 1024px){
          .collectiveHeroGrid,
          .collectiveTwoCol{
            grid-template-columns:1fr;
          }
          .collectiveMetricGrid,
          .collectiveToolsGrid,
          .campaignStatRow{
            grid-template-columns:repeat(2, minmax(0,1fr));
          }
        }
        @media (max-width: 720px){
          .collectiveMetricGrid,
          .collectiveToolsGrid,
          .campaignStatRow{
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
            <div className="collectiveKicker">COLLECTIVE OPERATIONS</div>
            <h1 className="pageTitle">Helvarix Research Collective</h1>
            <p className="collectiveLead">
              Public campaigns remain the heartbeat of the Array. Research Collective subscribers
              get an additional premium layer of limited-entry assignments, reserved for
              higher-focus work and coordinated campaign participation.
            </p>

            <div className="collectiveHeroMeta">
              <span className="goldBadge">{isPro ? "COLLECTIVE ACTIVE" : "COLLECTIVE LOCKED"}</span>
              <span className="statusBadge">Public campaign access</span>
              <span className="statusBadge">Research assignments</span>
              <span className="statusBadge">Limited entry slots</span>
            </div>
          </div>

          <aside className="collectiveStatusCard">
            <div className="collectiveStatusTop">
              <div>
                <div className="sectionKicker">CURRENT PLAN</div>
                <div className="collectivePrice">
                  $15<small>/month</small>
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
                  {busyCheckout ? "Opening Stripe…" : `Upgrade to Collective · ${MONTHLY_PRICE_LABEL}`}
                </button>
              )}

              <button
                className="ghostBtn"
                type="button"
                onClick={handlePortal}
                disabled={busyPortal}
              >
                Billing portal
              </button>
            </div>
          </aside>
        </div>
      </section>

      {loading ? (
        <section className="panel">
          <div className="stateTitle">Loading Collective…</div>
          <div className="stateText">Syncing membership, campaigns, and observatory context.</div>
        </section>
      ) : null}

      {notice ? <div className="alert info">{notice}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      {!campaignMembershipsEnabled ? (
        <div className="alert info">
          Campaign membership controls are wired in, but the campaign membership table is not available yet.
        </div>
      ) : null}

      {!teamsEnabled ? (
        <div className="alert info">
          Team assignment is wired in, but the team tables are not available yet.
        </div>
      ) : null}

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">MEMBERSHIP SNAPSHOT</div>
            <h2 className="sectionTitle">Subscriber performance layer</h2>
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
              <div className="sectionKicker">MEMBER TOOLS</div>
              <h2 className="sectionTitle">Premium operator toolkit</h2>
              <p className="sectionText" style={{ marginTop: 10 }}>
                Public campaigns remain available to everyone. Research Collective campaigns add a premium limited-entry assignment layer.
              </p>
            </div>
            <span className="statusBadge">{weatherLoading ? "Syncing weather…" : "Live context"}</span>
          </div>

          <div className="collectiveToolsGrid">
            {toolCards.map((tool) => (
              <div key={tool.title} className="collectiveToolCard">
                <div className="fieldLabel">{tool.title}</div>
                <div className={`collectiveToolValue ${tool.locked ? "locked" : "live"}`}>
                  {tool.value}
                </div>
                <div className="collectiveToolBody">{tool.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">PUBLIC IDENTITY</div>
              <h2 className="sectionTitle">Subscriber presence</h2>
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

            <div className="collectiveDataList">
              <div className="collectiveDataRow">
                <span>Public campaigns</span>
                <strong>{visiblePublicCampaigns.length}</strong>
              </div>
              <div className="collectiveDataRow">
                <span>Research assignments</span>
                <strong>{visibleResearchCampaigns.length}</strong>
              </div>
              <div className="collectiveDataRow">
                <span>Your teams</span>
                <strong>{teamsEnabled ? (teamsLoading ? "Loading…" : teams.length) : "Unavailable"}</strong>
              </div>
              <div className="collectiveDataRow">
                <span>Weather now</span>
                <strong>
                  {weather
                    ? `${getWeatherSummary(weather.weatherCode)}`
                    : weatherLoading
                    ? "Loading…"
                    : "Unavailable"}
                </strong>
              </div>
              <div className="collectiveDataRow">
                <span>Cloud cover</span>
                <strong>
                  {weather?.cloudCover != null ? `${Math.round(weather.cloudCover)}%` : "—"}
                </strong>
              </div>
              <div className="collectiveDataRow">
                <span>Wind speed</span>
                <strong>
                  {weather?.windKph != null ? `${Math.round(weather.windKph)} km/h` : "—"}
                </strong>
              </div>
              <div className="collectiveDataRow">
                <span>Sunset / Sunrise</span>
                <strong>
                  {weather?.sunsetIso || weather?.sunriseIso
                    ? `${formatClock(weather.sunsetIso)} / ${formatClock(weather.sunriseIso)}`
                    : "—"}
                </strong>
              </div>
              <div className="collectiveDataRow">
                <span>Moon illumination</span>
                <strong>{moonIllumination}%</strong>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="campaignSectionHeader">
          <div>
            <div className="sectionKicker">PUBLIC OPERATIONS</div>
            <h2 className="sectionTitle">Daily, weekly, and global campaigns</h2>
            <p className="sectionHint">
              These campaigns remain open to the wider Array. Research Collective subscribers still retain full access to them.
            </p>
          </div>
          <span className="statusBadge">{campaignLoading ? "Syncing…" : `${visiblePublicCampaigns.length} active`}</span>
        </div>

        <div className="campaignGrid">
          {visiblePublicCampaigns.length === 0 ? (
            <div className="campaignCard">
              <div className="campaignTitle">No public campaigns available</div>
              <div className="campaignDesc">
                No active public campaigns were returned from the database.
              </div>
            </div>
          ) : (
            visiblePublicCampaigns.map((campaign) => {
              const membership = myCampaignMemberships[campaign.id] ?? null;
              const joined = Boolean(membership);
              const tone = cadenceTone(campaign.cadence);

              return (
                <div key={campaign.id} className="campaignCard">
                  <div className="campaignTop">
                    <div>
                      <div className="campaignTitle">{campaign.title}</div>
                      <div className="campaignDesc">{campaign.description}</div>
                    </div>

                    <div className="campaignMetaRow">
                      <span className={`campaignMetaChip ${tone === "cyan" ? "toneCyan" : tone === "violet" ? "toneViolet" : "toneAmber"}`}>
                        {campaign.cadence}
                      </span>
                      <span className="campaignMetaChip">PUBLIC</span>
                      <span className="campaignMetaChip">{formatEndsIn(campaign.endAt)}</span>
                    </div>
                  </div>

                  <div className="campaignStatRow">
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Window</div>
                      <div className="campaignStatValue">{formatDateRange(campaign.startAt, campaign.endAt)}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Target type</div>
                      <div className="campaignStatValue">{campaign.targetType ?? "General"}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Cadence</div>
                      <div className="campaignStatValue">{campaign.cadence}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Availability</div>
                      <div className="campaignStatValue">Open access</div>
                    </div>
                  </div>

                  {campaign.tags.length > 0 ? (
                    <div className="campaignMetaRow">
                      {campaign.tags.map((tag) => (
                        <span key={`${campaign.id}-${tag}`} className="campaignMetaChip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="campaignActionRow">
                    {joined ? (
                      <button
                        className="ghostBtn"
                        type="button"
                        onClick={() => handleLeaveCampaign(campaign)}
                        disabled={campaignActionBusy === `leave-${campaign.id}` || !campaignMembershipsEnabled}
                      >
                        {campaignActionBusy === `leave-${campaign.id}` ? "Leaving…" : "Leave campaign"}
                      </button>
                    ) : (
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={() => handleJoinCampaign(campaign)}
                        disabled={campaignActionBusy === `join-${campaign.id}` || !campaignMembershipsEnabled}
                      >
                        {campaignActionBusy === `join-${campaign.id}` ? "Joining…" : "Join campaign"}
                      </button>
                    )}

                    {teamsEnabled && teams.length > 0 ? (
                      <select
                        className="campaignAssignSelect"
                        defaultValue=""
                        onChange={(e) => {
                          const teamId = e.target.value;
                          if (teamId) {
                            handleJoinCampaign(campaign, teamId);
                            e.currentTarget.value = "";
                          }
                        }}
                      >
                        <option value="">Assign team…</option>
                        {teams.map((team) => (
                          <option key={`${campaign.id}-${team.id}`} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="panel">
        <div className="campaignSectionHeader">
          <div>
            <div className="sectionKicker">RESEARCH COLLECTIVE</div>
            <h2 className="sectionTitle">Limited-entry research assignments</h2>
            <p className="sectionHint">
              This premium layer is reserved for Research Collective subscribers. Keep only 3–4 of these active at a time for a focused, special-assignment feel.
            </p>
          </div>
          <span className="statusBadge">
            {campaignLoading ? "Syncing…" : `${visibleResearchCampaigns.length} limited-entry`}
          </span>
        </div>

        <div className="campaignGrid">
          {visibleResearchCampaigns.length === 0 ? (
            <div className="campaignCard premium">
              <div className="campaignTitle">No research assignments available</div>
              <div className="campaignDesc">
                No active subscriber-only research campaigns were returned from the database.
              </div>
            </div>
          ) : (
            visibleResearchCampaigns.map((campaign) => {
              const membership = myCampaignMemberships[campaign.id] ?? null;
              const joined = Boolean(membership);
              const filledSlots = slotCounts[campaign.id] ?? 0;
              const slotCapacity = campaign.slotCapacity ?? 0;
              const slotsRemaining = Math.max(0, slotCapacity - filledSlots);
              const isFull =
                campaign.isLimitedEntry &&
                campaign.slotCapacity != null &&
                filledSlots >= campaign.slotCapacity &&
                !joined;
              const locked = !isPro;

              return (
                <div
                  key={campaign.id}
                  className={`campaignCard premium ${locked ? "locked" : ""}`}
                >
                  <div className="campaignTop">
                    <div>
                      <div className="campaignTitle">{campaign.title}</div>
                      <div className="campaignDesc">{campaign.description}</div>
                    </div>

                    <div className="campaignMetaRow">
                      <span className="campaignMetaChip gold">RESEARCH COLLECTIVE</span>
                      <span className="campaignMetaChip gold">LIMITED ENTRY</span>
                      {locked ? (
                        <span className="campaignMetaChip locked">SUBSCRIBER ONLY</span>
                      ) : isFull ? (
                        <span className="campaignMetaChip full">FULL</span>
                      ) : (
                        <span className="campaignMetaChip gold">
                          {filledSlots} / {slotCapacity} FILLED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="campaignStatRow">
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Window</div>
                      <div className="campaignStatValue">{formatDateRange(campaign.startAt, campaign.endAt)}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Target type</div>
                      <div className="campaignStatValue">{campaign.targetType ?? "Research"}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Filled slots</div>
                      <div className="campaignStatValue">{filledSlots}</div>
                    </div>
                    <div className="campaignStat">
                      <div className="campaignStatLabel">Remaining</div>
                      <div className="campaignStatValue">
                        {campaign.slotCapacity != null ? slotsRemaining : "—"}
                      </div>
                    </div>
                  </div>

                  {campaign.tags.length > 0 ? (
                    <div className="campaignMetaRow">
                      {campaign.tags.map((tag) => (
                        <span key={`${campaign.id}-${tag}`} className="campaignMetaChip gold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="campaignActionRow">
                    {!isPro ? (
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={handleUpgrade}
                        disabled={busyCheckout}
                      >
                        {busyCheckout ? "Opening Stripe…" : "Upgrade to unlock"}
                      </button>
                    ) : joined ? (
                      <button
                        className="ghostBtn"
                        type="button"
                        onClick={() => handleLeaveCampaign(campaign)}
                        disabled={campaignActionBusy === `leave-${campaign.id}` || !campaignMembershipsEnabled}
                      >
                        {campaignActionBusy === `leave-${campaign.id}` ? "Leaving…" : "Leave assignment"}
                      </button>
                    ) : (
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={() => handleJoinCampaign(campaign)}
                        disabled={
                          campaignActionBusy === `join-${campaign.id}` ||
                          !campaignMembershipsEnabled ||
                          isFull
                        }
                      >
                        {campaignActionBusy === `join-${campaign.id}`
                          ? "Joining…"
                          : isFull
                          ? "Campaign Full"
                          : "Join research assignment"}
                      </button>
                    )}

                    {isPro && teamsEnabled && teams.length > 0 ? (
                      <select
                        className="campaignAssignSelect"
                        defaultValue=""
                        onChange={(e) => {
                          const teamId = e.target.value;
                          if (teamId) {
                            handleJoinCampaign(campaign, teamId);
                            e.currentTarget.value = "";
                          }
                        }}
                        disabled={isFull && !joined}
                      >
                        <option value="">Assign team…</option>
                        {teams.map((team) => (
                          <option key={`${campaign.id}-${team.id}`} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
