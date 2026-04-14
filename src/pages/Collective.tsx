import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { openCustomerPortal } from "../lib/stripe";
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
  target_type?: string | null;
  target_name?: string | null;
  target_catalog?: string | null;
  target_ra?: string | null;
  target_dec?: string | null;
  target_constellation?: string | null;
  target_notes?: string | null;
  target_magnitude?: number | null;
  target_difficulty?: string | null;
  recommended_equipment?: string | null;
  tags: string[] | null;
  is_active: boolean | null;
  access_tier?: string | null;
  campaign_class?: string | null;
  slot_capacity?: number | null;
  is_limited_entry?: boolean | null;
  priority_rank?: number | null;
  template_key?: string | null;
  created_at?: string | null;
};

type CollectiveCampaign = {
  id: string;
  cadence: CampaignCadence;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  targetType: string | null;
  targetName: string | null;
  targetCatalog: string | null;
  targetRa: string | null;
  targetDec: string | null;
  targetConstellation: string | null;
  targetNotes: string | null;
  targetMagnitude: number | null;
  targetDifficulty: string | null;
  recommendedEquipment: string | null;
  tags: string[];
  accessTier: string;
  campaignClass: string;
  slotCapacity: number | null;
  isLimitedEntry: boolean;
  priorityRank: number | null;
  isActive: boolean;
  templateKey: string | null;
  createdAt: string | null;
};

type CampaignMembershipRecord = {
  campaign_id: string;
  user_id: string;
  team_id: string | null;
  status: string | null;
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

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role?: string | null;
  status: string | null;
};

type TeamInviteRecord = {
  id: string;
  team_id: string;
  invited_email: string | null;
  token: string;
  status: string | null;
  expires_at: string | null;
  created_at: string | null;
  created_by: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

type TeamMessageRecord = {
  id: string;
  team_id: string;
  user_id: string;
  body: string;
  created_at: string | null;
};

type TeamProfileRecord = {
  id: string;
  display_name: string | null;
};

const SOLAR_GOLD = "#f2bf57";
const MONTHLY_PRICE_LABEL = "$15/month";

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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


function makeInviteToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function formatRelativeTime(value: string | null) {
  if (!value) return "Just now";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "Just now";
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function displayProfileName(profile: TeamProfileRecord | null | undefined, fallbackSeed: string) {
  const saved = String(profile?.display_name ?? "").trim();
  return saved || generateAlias(fallbackSeed);
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
    message.includes("not found")
  );
}

function canSeeCampaign(campaign: { accessTier: string }, isPro: boolean) {
  if (campaign.accessTier === "research_collective") return isPro;
  return true;
}

function isBadCampaignTitle(title: string | null | undefined) {
  const value = String(title ?? "").trim().toLowerCase();
  return !value || value === "untitled campaign" || value === "untitled";
}

function normalizeCampaign(row: CampaignRow): CollectiveCampaign {
  const cadenceRaw = String(row.cadence ?? "GLOBAL").trim().toUpperCase();

  const cadence: CampaignCadence =
    cadenceRaw === "DAILY"
      ? "DAILY"
      : cadenceRaw === "WEEKLY"
      ? "WEEKLY"
      : cadenceRaw === "GLOBAL"
      ? "GLOBAL"
      : "GLOBAL";

  const fallbackTitle =
    cadence === "DAILY"
      ? "Daily Campaign"
      : cadence === "WEEKLY"
      ? "Weekly Campaign"
      : cadence === "GLOBAL"
      ? "Global Campaign"
      : "Research Assignment";

  const fallbackDescription =
    cadence === "DAILY"
      ? "Individual operator objective for today's observing cycle."
      : cadence === "WEEKLY"
      ? "Individual operator objective for the current weekly window."
      : cadence === "GLOBAL"
      ? "Array-wide public objective shared across the full network."
      : "Subscriber-only special assignment for the Research Collective.";

  return {
    id: row.id,
    cadence,
    title: isBadCampaignTitle(row.title) ? fallbackTitle : String(row.title).trim(),
    description: String(row.description ?? "").trim() || fallbackDescription,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    targetType: row.target_type ?? null,
    targetName: row.target_name ?? null,
    targetCatalog: row.target_catalog ?? null,
    targetRa: row.target_ra ?? null,
    targetDec: row.target_dec ?? null,
    targetConstellation: row.target_constellation ?? null,
    targetNotes: row.target_notes ?? null,
    targetMagnitude: row.target_magnitude ?? null,
    targetDifficulty: row.target_difficulty ?? null,
    recommendedEquipment: row.recommended_equipment ?? null,
    tags: row.tags ?? [],
    accessTier: String(row.access_tier ?? "free"),
    campaignClass: String(row.campaign_class ?? "public"),
    slotCapacity: row.slot_capacity ?? null,
    isLimitedEntry: Boolean(row.is_limited_entry),
    priorityRank: row.priority_rank ?? null,
    isActive: Boolean(row.is_active ?? true),
    templateKey: row.template_key ?? null,
    createdAt: row.created_at ?? null,
  };
}

function campaignFreshnessValue(campaign: CollectiveCampaign) {
  const created = campaign.createdAt ? new Date(campaign.createdAt).getTime() : 0;
  const start = campaign.startAt ? new Date(campaign.startAt).getTime() : 0;
  return Math.max(created || 0, start || 0);
}

function scoreCampaign(campaign: CollectiveCampaign) {
  let score = 0;
  if (!isBadCampaignTitle(campaign.title)) score += 1000;
  if (campaign.description && !campaign.description.toLowerCase().includes("array-wide campaign objective")) score += 100;
  if (campaign.isActive) score += 20;
  if (campaign.priorityRank != null) score += Math.max(0, 50 - campaign.priorityRank);
  score += campaignFreshnessValue(campaign) / 100000000000;
  return score;
}

function pickBestCampaignPerCadence(campaigns: CollectiveCampaign[]) {
  const cadences: CampaignCadence[] = ["DAILY", "WEEKLY", "GLOBAL"];

  return cadences
    .map((cadence) =>
      campaigns
        .filter((campaign) => campaign.cadence === cadence)
        .sort((a, b) => scoreCampaign(b) - scoreCampaign(a))[0]
    )
    .filter(Boolean) as CollectiveCampaign[];
}
function getCampaignTargetLabel(campaign: CollectiveCampaign) {
  if (campaign.campaignClass === "research_collective") {
    return campaign.targetName ?? campaign.targetType ?? "Research";
  }
  return campaign.targetType ?? "General";
}

function getCampaignTargetMeta(campaign: CollectiveCampaign) {
  if (campaign.campaignClass !== "research_collective") return null;

  const parts = [campaign.targetCatalog, campaign.targetConstellation].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
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
  const navigate = useNavigate();
  const device = useDeviceProfile("collective");
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
  const [myTeamMemberships, setMyTeamMemberships] = useState<Record<string, TeamMemberRow>>({});
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamActionBusy, setTeamActionBusy] = useState<string | null>(null);
  const [teamInvitesEnabled, setTeamInvitesEnabled] = useState(true);
  const [teamMessagesEnabled, setTeamMessagesEnabled] = useState(true);
  const [teamInvites, setTeamInvites] = useState<Record<string, TeamInviteRecord[]>>({});
  const [teamMessages, setTeamMessages] = useState<Record<string, TeamMessageRecord[]>>({});
  const [teamRosters, setTeamRosters] = useState<Record<string, TeamMemberRow[]>>({});
  const [teamProfiles, setTeamProfiles] = useState<Record<string, TeamProfileRecord>>({});
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [teamMessageDrafts, setTeamMessageDrafts] = useState<Record<string, string>>({});

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMaxMembers, setCreateMaxMembers] = useState("5");
  const [createPrivate, setCreatePrivate] = useState(true);
  const [mobileTab, setMobileTab] = useState<"toolbox" | "campaigns" | "teams">("toolbox");

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMaxMembers, setEditMaxMembers] = useState("5");
  const [editPrivate, setEditPrivate] = useState(true);

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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("team_invite");
    if (token) setInviteTokenInput(token);
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
  }, [sessionUser, isPro]);

  async function loadCampaigns() {
    setCampaignLoading(true);

    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id,cadence,title,description,start_at,end_at,target_type,target_name,target_catalog,target_ra,target_dec,target_constellation,target_notes,target_magnitude,target_difficulty,recommended_equipment,tags,is_active,access_tier,campaign_class,slot_capacity,is_limited_entry,priority_rank,template_key,created_at"
        )
        .eq("is_active", true)
        .order("campaign_class", { ascending: true })
        .order("priority_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("start_at", { ascending: false });

      if (error) throw error;

      const rows = ((data as CampaignRow[]) ?? []).map(normalizeCampaign);
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
        .select("campaign_id,team_id,user_id,status")
        .in("campaign_id", campaignIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      const seen = new Set<string>();
      for (const row of (data ?? []) as { campaign_id: string; team_id: string | null; user_id: string; status: string | null }[]) {
        if ((row.status ?? "active") !== "active") continue;
        const entryKey = `${row.campaign_id}:${row.team_id ?? row.user_id}`;
        if (seen.has(entryKey)) continue;
        seen.add(entryKey);
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
      const { data: memberRows, error: memberError } = await supabase
        .from("team_members")
        .select("team_id,user_id,role,status")
        .eq("user_id", userId);

      if (memberError) throw memberError;

      const membershipMap: Record<string, TeamMemberRow> = {};
      const teamIds = new Set<string>();

      for (const row of (memberRows ?? []) as any[]) {
        const membershipStatus = String(row.status ?? row.role ?? "active");
        membershipMap[row.team_id] = {
          team_id: row.team_id,
          user_id: row.user_id,
          role: row.role ?? null,
          status: membershipStatus,
        };

        if (["active", "accepted", "owner"].includes(membershipStatus.toLowerCase())) {
          teamIds.add(row.team_id);
        }
      }

      const { data: ownedData, error: ownedError } = await supabase
        .from("teams")
        .select("id,name,slug,description,owner_id,is_private,max_members,created_at")
        .eq("owner_id", userId);

      if (ownedError) throw ownedError;

      for (const team of (ownedData ?? []) as any[]) {
        teamIds.add(team.id);
        if (!membershipMap[team.id]) {
          membershipMap[team.id] = {
            team_id: team.id,
            user_id: userId,
            role: "owner",
            status: "owner",
          };
        }
      }

      let teamData: any[] = [];
      if (teamIds.size > 0) {
        const { data, error } = await supabase
          .from("teams")
          .select("id,name,slug,description,owner_id,is_private,max_members,created_at")
          .in("id", Array.from(teamIds));

        if (error) throw error;
        teamData = data ?? [];
      }

      setTeams(
        teamData
          .map((team) => ({
            id: team.id,
            name: team.name ?? "Untitled Team",
            slug: team.slug ?? null,
            description: team.description ?? null,
            owner_id: team.owner_id ?? null,
            is_private: team.is_private ?? true,
            max_members: team.max_members ?? null,
            created_at: team.created_at ?? null,
          }))
          .sort((a, b) => {
            const ownerA = a.owner_id === userId ? 0 : 1;
            const ownerB = b.owner_id === userId ? 0 : 1;
            if (ownerA !== ownerB) return ownerA - ownerB;
            return a.name.localeCompare(b.name);
          })
      );
      setMyTeamMemberships(membershipMap);
      setTeamsEnabled(true);

      const loadedTeamIds = teamData.map((team) => team.id);
      await Promise.all([
        loadTeamRosters(loadedTeamIds),
        loadTeamInvites(loadedTeamIds),
        loadTeamMessages(loadedTeamIds),
      ]);
    } catch (err: any) {
      console.error("TEAM LOAD ERROR:", err);
      setTeamsEnabled(true);
      setTeams([]);
      setMyTeamMemberships({});
      setTeamRosters({});
      setTeamInvites({});
      setTeamMessages({});
      setTeamProfiles({});
      setError((current) => current ?? err?.message ?? "Unable to load teams right now.");
    } finally {
      setTeamsLoading(false);
    }
  }


  async function hydrateProfiles(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueIds.length) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", uniqueIds);

      if (error) throw error;

      setTeamProfiles((current) => {
        const next = { ...current };
        for (const row of (data ?? []) as any[]) {
          next[row.id] = {
            id: row.id,
            display_name: row.display_name ?? null,
          };
        }
        return next;
      });
    } catch (err) {
      // Ignore profile hydration failures; aliases are used as a fallback.
    }
  }

  async function loadTeamRosters(teamIds: string[]) {
    if (!teamIds.length) {
      setTeamRosters({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id,user_id,role,status")
        .in("team_id", teamIds)
        .order("team_id", { ascending: true });

      if (error) throw error;

      const next: Record<string, TeamMemberRow[]> = {};
      const profileIds: string[] = [];

      for (const row of (data ?? []) as any[]) {
        const membershipStatus = String(row.status ?? row.role ?? "active").toLowerCase();
        if (!["active", "accepted", "owner", "member", "admin"].includes(membershipStatus)) continue;
        if (!next[row.team_id]) next[row.team_id] = [];
        next[row.team_id].push({
          team_id: row.team_id,
          user_id: row.user_id,
          role: row.role ?? null,
          status: row.status ?? null,
        });
        profileIds.push(row.user_id);
      }

      Object.values(next).forEach((rows) =>
        rows.sort((a, b) => {
          const roleOrder = (value?: string | null) => {
            const role = String(value ?? "").toLowerCase();
            if (role === "owner") return 0;
            if (role === "admin") return 1;
            return 2;
          };
          return roleOrder(a.role) - roleOrder(b.role);
        })
      );

      setTeamRosters(next);
      await hydrateProfiles(profileIds);
    } catch (err: any) {
      setError((current) => current ?? err?.message ?? "Unable to load team rosters.");
    }
  }

  async function loadTeamInvites(teamIds: string[]) {
    if (!teamIds.length) {
      setTeamInvites({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("team_invites")
        .select("id,team_id,invited_email,token,status,expires_at,created_at,created_by,accepted_at,accepted_by")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const next: Record<string, TeamInviteRecord[]> = {};
      for (const row of (data ?? []) as TeamInviteRecord[]) {
        if (!next[row.team_id]) next[row.team_id] = [];
        next[row.team_id].push(row);
      }

      setTeamInvites(next);
      setTeamInvitesEnabled(true);
    } catch (err: any) {
      if (looksLikeMissingRelation(err)) {
        setTeamInvitesEnabled(false);
        setTeamInvites({});
      } else {
        setError((current) => current ?? err?.message ?? "Unable to load team invites.");
      }
    }
  }

  async function loadTeamMessages(teamIds: string[]) {
    if (!teamIds.length) {
      setTeamMessages({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("team_messages")
        .select("id,team_id,user_id,body,created_at")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) throw error;

      const next: Record<string, TeamMessageRecord[]> = {};
      const profileIds: string[] = [];
      for (const row of (data ?? []) as TeamMessageRecord[]) {
        if (!next[row.team_id]) next[row.team_id] = [];
        next[row.team_id].push(row);
        profileIds.push(row.user_id);
      }

      for (const teamId of Object.keys(next)) {
        next[teamId] = next[teamId].sort((a, b) => {
          const at = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bt - at;
        });
      }

      setTeamMessages(next);
      setTeamMessagesEnabled(true);
      await hydrateProfiles(profileIds);
    } catch (err: any) {
      if (looksLikeMissingRelation(err)) {
        setTeamMessagesEnabled(false);
        setTeamMessages({});
      } else {
        setError((current) => current ?? err?.message ?? "Unable to load team messages.");
      }
    }
  }

  async function handleCreateInvite(team: TeamRecord) {
    if (!sessionUser) return;
    const rawEmail = String(inviteEmail[team.id] ?? "").trim().toLowerCase();

    setTeamActionBusy(`invite-${team.id}`);
    setError(null);
    setNotice(null);

    try {
      if (!teamInvitesEnabled) {
        throw new Error("The team_invites table is not available yet. Run the SQL first.");
      }

      const inviteToken = makeInviteToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from("team_invites").insert({
        team_id: team.id,
        invited_email: rawEmail || null,
        token: inviteToken,
        status: "pending",
        created_by: sessionUser.id,
        expires_at: expiresAt,
      });

      if (error) throw error;

      setInviteEmail((current) => ({ ...current, [team.id]: "" }));
      await loadTeamInvites([team.id]);
      const inviteUrl = `${window.location.origin}${window.location.pathname}?team_invite=${inviteToken}`;
      setNotice(
        rawEmail
          ? `Invite created for ${rawEmail}. Share this link: ${inviteUrl}`
          : `Invite link created. Share this link: ${inviteUrl}`
      );
    } catch (err: any) {
      setError(err?.message ?? "Unable to create invite.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  async function handleRevokeInvite(team: TeamRecord, inviteId: string) {
    if (!sessionUser) return;
    setTeamActionBusy(`revoke-${inviteId}`);
    setError(null);
    setNotice(null);

    try {
      if (!teamInvitesEnabled) {
        throw new Error("The team_invites table is not available yet.");
      }

      const { error } = await supabase
        .from("team_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId)
        .eq("team_id", team.id);

      if (error) throw error;

      await loadTeamInvites([team.id]);
      setNotice("Invite revoked.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to revoke invite.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  async function handleAcceptInvite() {
    if (!sessionUser) return;
    const token = inviteTokenInput.trim();
    if (!token) {
      setError("Paste an invite token or invite URL token first.");
      return;
    }

    setTeamActionBusy("accept-invite");
    setError(null);
    setNotice(null);

    try {
      if (!teamInvitesEnabled) {
        throw new Error("The team_invites table is not available yet. Run the SQL first.");
      }

      const { data: invite, error: inviteError } = await supabase
        .from("team_invites")
        .select("id,team_id,invited_email,token,status,expires_at,created_at,created_by,accepted_at,accepted_by")
        .eq("token", token)
        .maybeSingle();

      if (inviteError) throw inviteError;
      if (!invite) throw new Error("Invite not found.");
      if (String(invite.status ?? "pending").toLowerCase() !== "pending") {
        throw new Error("This invite is no longer active.");
      }
      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        throw new Error("This invite has expired.");
      }

      const invitedEmail = String(invite.invited_email ?? "").trim().toLowerCase();
      const myEmail = String(sessionUser.email ?? "").trim().toLowerCase();
      if (invitedEmail && invitedEmail !== myEmail) {
        throw new Error("This invite was issued for a different email address.");
      }

      const currentMembers = teamRosters[invite.team_id] ?? [];
      const team = teams.find((item) => item.id === invite.team_id) ?? null;
      if (team?.max_members && currentMembers.length >= team.max_members) {
        throw new Error("This team is already at max capacity.");
      }

      const { error: memberError } = await supabase.from("team_members").upsert(
        {
          team_id: invite.team_id,
          user_id: sessionUser.id,
          role: "member",
          status: "active",
        },
        { onConflict: "team_id,user_id" }
      );
      if (memberError) throw memberError;

      const { error: updateError } = await supabase
        .from("team_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_by: sessionUser.id,
        })
        .eq("id", invite.id);

      if (updateError) throw updateError;

      setInviteTokenInput("");
      await loadTeams(sessionUser.id);
      setNotice("Invite accepted. You have joined the team.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to accept invite.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  async function handleRemoveMember(team: TeamRecord, memberUserId: string) {
    if (!sessionUser) return;
    if (memberUserId === sessionUser.id) {
      setError("Use leave team if you want to remove yourself.");
      return;
    }

    setTeamActionBusy(`remove-member-${team.id}-${memberUserId}`);
    setError(null);
    setNotice(null);

    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", team.id)
        .eq("user_id", memberUserId);

      if (error) throw error;

      await Promise.all([loadTeamRosters([team.id]), loadTeams(sessionUser.id)]);
      setNotice("Member removed from team.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to remove member.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  async function handleSendTeamMessage(team: TeamRecord) {
    if (!sessionUser) return;
    const body = String(teamMessageDrafts[team.id] ?? "").trim();
    if (!body) {
      setError("Type a message before sending.");
      return;
    }

    setTeamActionBusy(`send-message-${team.id}`);
    setError(null);
    setNotice(null);

    try {
      if (!teamMessagesEnabled) {
        throw new Error("The team_messages table is not available yet. Run the SQL first.");
      }

      const { error } = await supabase.from("team_messages").insert({
        team_id: team.id,
        user_id: sessionUser.id,
        body,
      });

      if (error) throw error;

      setTeamMessageDrafts((current) => ({ ...current, [team.id]: "" }));
      await loadTeamMessages([team.id]);
      setNotice("Team message posted.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to send message.");
    } finally {
      setTeamActionBusy(null);
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

      if (!canSeeCampaign(campaign, isPro)) {
        throw new Error("This campaign requires Research Collective membership.");
      }

      const isResearchCampaign =
        campaign.campaignClass.toLowerCase() === "research_collective" ||
        campaign.accessTier.toLowerCase() === "research_collective";

      if (teamId && !isResearchCampaign) {
        throw new Error("Teams can only be assigned to Research Collective campaigns.");
      }

      const filledSlots = slotCounts[campaign.id] ?? 0;
      const isFull =
        campaign.isLimitedEntry &&
        campaign.slotCapacity != null &&
        filledSlots >= campaign.slotCapacity &&
        !myCampaignMemberships[campaign.id];

      if (teamId) {
        const { data: existingTeamEntry, error: existingTeamError } = await supabase
          .from("campaign_memberships")
          .select("campaign_id,user_id,team_id,status")
          .eq("campaign_id", campaign.id)
          .eq("team_id", teamId)
          .eq("status", "active")
          .maybeSingle();

        if (existingTeamError) throw existingTeamError;
        if (existingTeamEntry && existingTeamEntry.user_id !== sessionUser.id) {
          throw new Error("That team is already entered in this campaign.");
        }
      }

      if (isFull) {
        throw new Error("This research campaign is already full.");
      }

      const payload = {
        campaign_id: campaign.id,
        user_id: sessionUser.id,
        team_id: teamId,
        status: "active" as const,
      };

      const { error } = teamId
        ? await supabase.from("campaign_memberships").insert(payload)
        : await supabase.from("campaign_memberships").upsert(payload, {
            onConflict: "campaign_id,user_id",
          });

      if (error) throw error;

      const previous = myCampaignMemberships[campaign.id] ?? null;
      const previousEntryKey = previous ? `${campaign.id}:${previous.team_id ?? previous.user_id}` : null;
      const nextEntryKey = `${campaign.id}:${teamId ?? sessionUser.id}`;

      setMyCampaignMemberships((current) => ({
        ...current,
        [campaign.id]: {
          campaign_id: campaign.id,
          user_id: sessionUser.id,
          team_id: teamId,
          status: "active",
        },
      }));

      if (!previousEntryKey) {
        setSlotCounts((current) => ({
          ...current,
          [campaign.id]: (current[campaign.id] ?? 0) + 1,
        }));
      } else if (previousEntryKey !== nextEntryKey) {
        setSlotCounts((current) => ({ ...current }));
      }

      setNotice(teamId ? "Team entered into research." : "Research joined.");
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

  async function handleCreateTeam() {
    if (!sessionUser) return;

    const trimmedName = createName.trim();
    if (!trimmedName) {
      setError("Team name is required.");
      return;
    }

    setTeamActionBusy("create-team");
    setError(null);
    setNotice(null);

    try {
      const slugBase = slugify(trimmedName) || `team-${Date.now()}`;
      const maxMembers = Math.max(2, Math.min(100, Number(createMaxMembers) || 5));

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          name: trimmedName,
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 8)}`,
          description: createDescription.trim() || null,
          owner_id: sessionUser.id,
          is_private: createPrivate,
          max_members: maxMembers,
        })
        .select("id,name,slug,description,owner_id,is_private,max_members,created_at")
        .single();

      if (teamError) throw teamError;

      const { error: memberError } = await supabase.from("team_members").upsert(
        {
          team_id: team.id,
          user_id: sessionUser.id,
          role: "owner",
          status: "active",
        },
        { onConflict: "team_id,user_id" }
      );

      if (memberError) throw memberError;

      setCreateName("");
      setCreateDescription("");
      setCreateMaxMembers("5");
      setCreatePrivate(true);
      setNotice("Team created. You are now the owner.");
      await loadTeams(sessionUser.id);
    } catch (err: any) {
      setError(err?.message ?? "Unable to create team.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  function startEditingTeam(team: TeamRecord) {
    setEditingTeamId(team.id);
    setEditName(team.name);
    setEditDescription(team.description ?? "");
    setEditMaxMembers(String(team.max_members ?? 5));
    setEditPrivate(Boolean(team.is_private ?? true));
  }

  function cancelEditingTeam() {
    setEditingTeamId(null);
    setEditName("");
    setEditDescription("");
    setEditMaxMembers("5");
    setEditPrivate(true);
  }

  async function handleSaveTeam(teamId: string) {
    if (!sessionUser) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Team name is required.");
      return;
    }

    setTeamActionBusy(`save-${teamId}`);
    setError(null);
    setNotice(null);

    try {
      const maxMembers = Math.max(2, Math.min(100, Number(editMaxMembers) || 5));
      const { error } = await supabase
        .from("teams")
        .update({
          name: trimmedName,
          description: editDescription.trim() || null,
          is_private: editPrivate,
          max_members: maxMembers,
        })
        .eq("id", teamId)
        .eq("owner_id", sessionUser.id);

      if (error) throw error;

      setNotice("Team updated.");
      cancelEditingTeam();
      await loadTeams(sessionUser.id);
    } catch (err: any) {
      setError(err?.message ?? "Unable to update team.");
    } finally {
      setTeamActionBusy(null);
    }
  }

  async function handleLeaveTeam(team: TeamRecord) {
    if (!sessionUser) return;

    const isOwner = team.owner_id === sessionUser.id;
    setTeamActionBusy(`${isOwner ? "delete" : "leave"}-${team.id}`);
    setError(null);
    setNotice(null);

    try {
      if (isOwner) {
        const { error } = await supabase.from("teams").delete().eq("id", team.id).eq("owner_id", sessionUser.id);
        if (error) throw error;
        setNotice("Team deleted.");
      } else {
        const { error } = await supabase
          .from("team_members")
          .delete()
          .eq("team_id", team.id)
          .eq("user_id", sessionUser.id);
        if (error) throw error;
        setNotice("You left the team.");
      }

      if (editingTeamId === team.id) cancelEditingTeam();
      await loadTeams(sessionUser.id);
    } catch (err: any) {
      setError(err?.message ?? (isOwner ? "Unable to delete team." : "Unable to leave team."));
    } finally {
      setTeamActionBusy(null);
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

  const publicCampaigns = useMemo(() => {
    const publicPool = campaigns.filter((campaign) => {
      const className = String(campaign.campaignClass ?? "").trim().toLowerCase();
      const tier = String(campaign.accessTier ?? "").trim().toLowerCase();
      return className !== "research_collective" && tier !== "research_collective" && campaign.isActive;
    });

    return pickBestCampaignPerCadence(publicPool);
  }, [campaigns]);

  const researchCampaigns = useMemo(() => {
    return campaigns
      .filter((campaign) => {
        const className = campaign.campaignClass.toLowerCase();
        const tier = campaign.accessTier.toLowerCase();
        return className === "research_collective" || tier === "research_collective";
      })
      .sort((a, b) => {
        const rankA = a.priorityRank ?? 9999;
        const rankB = b.priorityRank ?? 9999;
        if (rankA !== rankB) return rankA - rankB;
        return campaignFreshnessValue(b) - campaignFreshnessValue(a);
      })
      .slice(0, 4);
  }, [campaigns]);

  const ownedTeams = useMemo(() => {
    if (!sessionUser) return [];
    return teams.filter((team) => team.owner_id === sessionUser.id);
  }, [teams, sessionUser]);

  const activeCampaignCount = publicCampaigns.length + researchCampaigns.length;

  const pendingInviteCount = useMemo(() => {
    return Object.values(teamInvites).reduce(
      (count, invites) => count + invites.filter((invite) => String(invite.status ?? "pending").toLowerCase() === "pending").length,
      0
    );
  }, [teamInvites]);


  const campaignBoard = useMemo(() => {
    return [...publicCampaigns, ...researchCampaigns].sort((a, b) => {
      const order = { DAILY: 0, WEEKLY: 1, GLOBAL: 2, RESEARCH: 3 } as const;
      const cadenceDelta = order[a.cadence] - order[b.cadence];
      if (cadenceDelta !== 0) return cadenceDelta;

      const rankA = a.priorityRank ?? 9999;
      const rankB = b.priorityRank ?? 9999;
      if (rankA !== rankB) return rankA - rankB;

      return campaignFreshnessValue(b) - campaignFreshnessValue(a);
    });
  }, [publicCampaigns, researchCampaigns]);

  const limitedSlotTotals = useMemo(() => {
    return researchCampaigns.reduce(
      (acc, campaign) => {
        const capacity = campaign.slotCapacity ?? 0;
        const filled = slotCounts[campaign.id] ?? 0;
        acc.capacity += capacity;
        acc.filled += filled;
        return acc;
      },
      { capacity: 0, filled: 0 }
    );
  }, [researchCampaigns, slotCounts]);

  const nextEndingCampaign = useMemo(() => {
    return campaignBoard
      .filter((campaign) => campaign.endAt)
      .sort((a, b) => {
        const aTime = a.endAt ? new Date(a.endAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.endAt ? new Date(b.endAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })[0] ?? null;
  }, [campaignBoard]);

  const isMobileCollective = device.isMobile;

  const premiumToolCards = [
    {
      title: "Priority campaign stack",
      value: isPro ? `${researchCampaigns.length} private assignments` : "Subscriber only",
      body: isPro
        ? "See subscriber-only research assignments without mixing them into the public layer."
        : "Adds the limited-entry research layer on top of the public campaign stack.",
      locked: !isPro,
    },
    {
      title: "Slot pressure monitor",
      value: isPro
        ? limitedSlotTotals.capacity > 0
          ? `${limitedSlotTotals.filled}/${limitedSlotTotals.capacity} filled`
          : "No slot-limited runs"
        : "Subscriber only",
      body: isPro
        ? "Fast-read fill state across all private campaigns so you know when to claim a slot."
        : "Monitor limited-entry availability across private research assignments.",
      locked: !isPro,
    },
    {
      title: "Target package",
      value: isPro
        ? researchCampaigns[0]
          ? getCampaignTargetLabel(researchCampaigns[0])
          : "Awaiting assignment"
        : "Subscriber only",
      body: isPro
        ? "Coordinate, target, equipment, and difficulty cues stay visible from the board."
        : "Adds richer target context for private timing, imaging, and follow-up work.",
      locked: !isPro,
    },
    {
      title: "Team deployment",
      value: isPro ? `${teams.length} teams · ${pendingInviteCount} pending invites` : "Subscriber only",
      body: isPro
        ? "Create teams, issue invite links, manage members, and attach teams to campaigns from the same page."
        : "Unlock team creation, invites, roster management, and campaign assignment controls.",
      locked: !isPro,
    },
  ];

  const toolCards = [
    {
      title: "Observing Window",
      value: weather ? `${rating.label} · ${rating.score}/100` : "Awaiting conditions",
      body: "Local conditions scored for session quality, wind, cloud cover, visibility, and moonlight.",
      locked: false,
      accent: "live",
    },
    {
      title: "Site Conditions",
      value:
        weather && weather.temperatureC != null
          ? `${Math.round(weather.temperatureC)}°C · ${getWeatherSummary(weather.weatherCode)}`
          : "No active weather snapshot",
      body: "Fast-read environment data for setup, teardown, and imaging decisions.",
      locked: false,
      accent: "live",
    },
    {
      title: "Darkness Timing",
      value:
        weather?.sunsetIso || weather?.sunriseIso
          ? `${formatClock(weather.sunsetIso)} sunset · ${formatClock(weather.sunriseIso)} sunrise`
          : "Location needed",
      body: "Sunset and sunrise timing for planning observation windows.",
      locked: false,
      accent: "live",
    },
    {
      title: "Moonlight Impact",
      value: `${moonPhaseLabel} · ${moonIllumination}% illuminated`,
      body: "Useful for deep-sky planning, contrast expectations, and target selection.",
      locked: false,
      accent: "live",
    },
    {
      title: "Campaign mix",
      value: `${publicCampaigns.length} public · ${researchCampaigns.length} private`,
      body: "One daily, one weekly, and one global campaign remain visible even without a subscription.",
      locked: false,
      accent: "live",
    },
    {
      title: "Next closing window",
      value: nextEndingCampaign ? formatEndsIn(nextEndingCampaign.endAt) : "Open schedule",
      body: nextEndingCampaign
        ? `${nextEndingCampaign.title} is the next campaign to expire.`
        : "No campaign end window is currently scheduled.",
      locked: false,
      accent: "live",
    },
    ...premiumToolCards.map((card) => ({
      ...card,
      accent: card.locked ? "locked" : "premium",
    })),
  ];

   if (loading) {
    return (
      <div className={`pageStack collectivePage device-${device.deviceClass} ${isMobileCollective && !isPro ? "paywalledMobile" : ""}`}>
        <style>{styles}</style>
        <div className="panel loadingPanel">
          <div className="sectionKicker">HELVARIX RESEARCH COLLECTIVE</div>
          <h2 className="sectionTitle">Loading Collective</h2>
          <div className="stateText">Syncing membership, campaigns, teams, and observatory context.</div>
        </div>
      </div>
    );
  }

   return (
    <div className={`pageStack collectivePage device-${device.deviceClass} ${isMobileCollective && !isPro ? "paywalledMobile" : ""}`}>
      <style>{styles}</style>

      {!isMobileCollective ? (
        <section className="panel heroPanel collectiveHero">
          <div className="collectiveHeroGrid">
            <div>
              <div className="collectiveKicker">HELVARIX RESEARCH COLLECTIVE</div>
              <h1 className="heroTitle">Private campaigns, team coordination, and observatory tools</h1>
              <p className="collectiveLead">
                Public campaigns remain available to all operators: daily, weekly, and global.
              </p>

              <div className="collectiveHeroMeta">
                <span className="goldBadge">Operator · {displayName}</span>
                <span className="goldBadge">Location · {locationLabel}</span>
                <span className="goldBadge">Membership · {isPro ? "ACTIVE" : "STANDARD"}</span>
              </div>
            </div>

            <div className="collectiveStatusCard">
              <div className="collectiveStatusTop">
                <div>
                  <div className="sectionKicker">RESEARCH COLLECTIVE</div>
                  <div className="collectivePrice">
                    {MONTHLY_PRICE_LABEL}
                    <small>subscriber tier</small>
                  </div>
                </div>
                <span className={`statusBadge ${isPro ? "statusLive" : "statusLocked"}`}>
                  {isPro ? "Membership active" : "Upgrade available"}
                </span>
              </div>

              <div className="collectiveMiniList">
                <div className="collectiveMiniRow"><span>Public campaign layer</span><strong>Daily / Weekly / Global</strong></div>
                <div className="collectiveMiniRow">
                  <span>Private campaign layer</span>
                  <strong>{isPro ? "Limited-entry collective" : "Subscriber only"}</strong>
                </div>
                <div className="collectiveMiniRow">
                  <span>Team controls</span>
                  <strong>{isPro ? "Create / edit / own" : "Subscriber only"}</strong>
                </div>
              </div>

              <div className="buttonRow">
                {!isPro ? (
                  <button className="primaryBtn" type="button" onClick={handleUpgrade} disabled={busyCheckout}>
                    {busyCheckout ? "Opening Stripe…" : "Upgrade to Research Collective"}
                  </button>
                ) : (
                  <button className="primaryBtn" type="button" onClick={handlePortal} disabled={busyPortal}>
                    {busyPortal ? "Opening billing…" : "Manage membership"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel collectiveMobileHeader">
          <div className="collectiveMobileHeaderTop">
            <div>
              <div className="collectiveKicker">HELVARIX RESEARCH COLLECTIVE</div>
              <h1 className="collectiveMobileHeaderTitle">{isPro ? "Manage Subscription" : "Research Collective"}</h1>
            </div>

            {isPro ? (
              <button
                className="primaryBtn collectiveMobileManageBtn"
                type="button"
                onClick={handlePortal}
                disabled={busyPortal}
              >
                {busyPortal ? "Opening billing…" : "Manage subscription"}
              </button>
            ) : (
              <span className="statusBadge statusLocked">Upgrade required</span>
            )}
          </div>
        </section>
      )}

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      {isMobileCollective ? (
        <section className="panel collectiveMobileTabsPanel">
          <div className="collectiveMobileTabs">
            <button
              type="button"
              className={`collectiveMobileTab ${mobileTab === "toolbox" ? "active" : ""}`}
              onClick={() => setMobileTab("toolbox")}
            >
              Toolbox
            </button>
            <button
              type="button"
              className={`collectiveMobileTab ${mobileTab === "campaigns" ? "active" : ""}`}
              onClick={() => setMobileTab("campaigns")}
            >
              Campaigns
            </button>
            <button
              type="button"
              className={`collectiveMobileTab ${mobileTab === "teams" ? "active" : ""}`}
              onClick={() => setMobileTab("teams")}
            >
              Teams
            </button>
          </div>
        </section>
      ) : null}

      {isMobileCollective && !isPro ? (
        <div className="collectivePaywallOverlay" role="dialog" aria-modal="true" aria-label="Research Collective upgrade required">
          <div className="collectivePaywallScrim" />
          <div className="collectivePaywallCard panel">
            <div className="collectiveKicker">HELVARIX RESEARCH COLLECTIVE</div>
            <h2 className="collectivePaywallTitle">Subscriber campaigns, team ownership, and observatory support</h2>
            <p className="collectivePaywallText">
              Upgrade to unlock the private campaign layer, team controls, and subscriber-only research tools on mobile.
            </p>

            <div className="collectiveMiniList">
              <div className="collectiveMiniRow"><span>Public campaign layer</span><strong>Daily / Weekly / Global</strong></div>
              <div className="collectiveMiniRow"><span>Private campaign layer</span><strong>Subscriber only</strong></div>
              <div className="collectiveMiniRow"><span>Team controls</span><strong>Subscriber only</strong></div>
            </div>

            <div className="collectivePaywallActions">
              <button className="primaryBtn" type="button" onClick={handleUpgrade} disabled={busyCheckout}>
                {busyCheckout ? "Opening Stripe…" : "Upgrade to Research Collective"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(!isMobileCollective || mobileTab === "toolbox") ? (
        <>
      <section className="collectiveMetricGrid">
        <div className="collectiveMetricCard">
          <div className="metricLabel">Observation index</div>
          <div className="collectiveMetricValue">{observationIndex}</div>
        </div>
        <div className="collectiveMetricCard">
          <div className="metricLabel">Campaign impact</div>
          <div className="collectiveMetricValue">{campaignImpact}</div>
        </div>
        <div className="collectiveMetricCard">
          <div className="metricLabel">Visible campaigns</div>
          <div className="collectiveMetricValue">{activeCampaignCount}</div>
        </div>
        <div className="collectiveMetricCard">
          <div className="metricLabel">Weather sync</div>
          <div className="collectiveMetricValue">{weatherLoading ? "Syncing…" : rating.label}</div>
        </div>
      </section>

      <section className="panel">
        <div className="campaignSectionHeader">
          <div>
            <div className="sectionKicker">COLLECTIVE TOOLS</div>
            <h2 className="sectionTitle">Subscriber toolbox</h2>
            <p className="sectionHint">
              Subscriber tools for private campaigns, slot visibility, team coordination, and target context.
            </p>
          </div>
        </div>

        <div className="collectiveToolsGrid premiumToolGrid">
          {toolCards.map((card) => (
            <div key={card.title} className={`collectiveToolCard ${card.accent === "premium" ? "premium" : ""}`}>
              <div className="metricLabel">{card.title}</div>
              <div className={`collectiveToolValue ${card.accent}`}>{card.value}</div>
              <div className="collectiveToolBody">{card.body}</div>
            </div>
          ))}
        </div>
      </section>
        </>
      ) : null}

      {(!isMobileCollective || mobileTab === "campaigns") ? (
      <section className="panel">
        <div className="campaignSectionHeader">
          <div>
            <div className="sectionKicker">CAMPAIGN BOARD</div>
            <h2 className="sectionTitle">Daily, weekly, global, and collective campaigns at a glance</h2>
            <p className="sectionHint">
              The board below keeps every live campaign in a denser card layout so all seven campaigns can be scanned
              quickly without losing join, leave, team assignment, slot, or upgrade actions.
            </p>
          </div>
          <span className="statusBadge">{campaignLoading ? "Syncing…" : `${campaignBoard.length} visible`}</span>
        </div>

        <div className="campaignBoardGrid">
          {campaignBoard.length === 0 ? (
            <div className="campaignCard campaignBoardCard emptyCampaignCard">
              <div className="campaignTitle">No campaigns available</div>
              <div className="campaignDesc">No active campaigns are available right now.</div>
            </div>
          ) : (
            campaignBoard.map((campaign) => {
              const membership = myCampaignMemberships[campaign.id] ?? null;
              const joined = Boolean(membership);
              const tone = cadenceTone(campaign.cadence);
              const isResearch = campaign.campaignClass === "research_collective" || campaign.accessTier === "research_collective";
              const filledSlots = slotCounts[campaign.id] ?? 0;
              const slotCapacity = campaign.slotCapacity ?? 0;
              const slotsRemaining = Math.max(0, slotCapacity - filledSlots);
              const isFull =
                campaign.isLimitedEntry &&
                campaign.slotCapacity != null &&
                filledSlots >= campaign.slotCapacity &&
                !joined;
              const locked = isResearch && !isPro;
              const targetLabel = isResearch ? getCampaignTargetLabel(campaign) : campaign.targetName ?? "Open target";

              return (
                <div
                  key={campaign.id}
                  className={`campaignCard campaignBoardCard ${isResearch ? "premium" : ""} ${locked ? "locked" : ""}`}
                >
                  <div className="campaignBoardTop">
                    <div className="campaignBoardHeaderText">
                      <div className="campaignTitle compact">{campaign.title}</div>
                      <div className="campaignDesc compact">{campaign.description}</div>
                    </div>

                    <div className="campaignMetaRow compact">
                      <span className={`campaignMetaChip ${tone === "cyan" ? "toneCyan" : tone === "violet" ? "toneViolet" : "toneAmber"}`}>
                        {campaign.cadence}
                      </span>
                      <span className={`campaignMetaChip ${isResearch ? "gold" : ""}`}>
                        {isResearch ? "RESEARCH" : "PUBLIC"}
                      </span>
                      {isResearch ? (
                        locked ? (
                          <span className="campaignMetaChip locked">SUBSCRIBER ONLY</span>
                        ) : isFull ? (
                          <span className="campaignMetaChip full">FULL</span>
                        ) : (
                          <span className="campaignMetaChip gold">{slotCapacity > 0 ? `${slotsRemaining} OPEN` : "LIMITED ENTRY"}</span>
                        )
                      ) : (
                        <span className="campaignMetaChip">{formatEndsIn(campaign.endAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="campaignBoardStats">
                    <div className="campaignMiniStat">
                      <div className="campaignStatLabel">Target</div>
                      <div className="campaignStatValue">{targetLabel}</div>
                    </div>
                    <div className="campaignMiniStat">
                      <div className="campaignStatLabel">{isResearch ? "Window" : "Availability"}</div>
                      <div className="campaignStatValue">
                        {isResearch ? formatDateRange(campaign.startAt, campaign.endAt) : campaign.cadence === "GLOBAL" ? "Community objective" : "Open access"}
                      </div>
                    </div>
                    <div className="campaignMiniStat">
                      <div className="campaignStatLabel">{isResearch ? "Slots" : "Window"}</div>
                      <div className="campaignStatValue">
                        {isResearch ? (campaign.slotCapacity != null ? `${filledSlots}/${campaign.slotCapacity} filled` : "Flexible") : formatDateRange(campaign.startAt, campaign.endAt)}
                      </div>
                    </div>
                    <div className="campaignMiniStat">
                      <div className="campaignStatLabel">{isResearch ? "Equipment" : "Cadence"}</div>
                      <div className="campaignStatValue">
                        {isResearch ? campaign.recommendedEquipment ?? "Open instrumentation" : campaign.cadence}
                      </div>
                    </div>
                  </div>

                  {isResearch ? (
                    <>
                      {campaign.targetName ? (
                        <div className="campaignMetaRow compact">
                          {getCampaignTargetMeta(campaign) ? (
                            <span className="campaignMetaChip gold">{getCampaignTargetMeta(campaign)}</span>
                          ) : null}
                          {campaign.targetRa && campaign.targetDec ? (
                            <span className="campaignMetaChip gold">{campaign.targetRa} · {campaign.targetDec}</span>
                          ) : null}
                          {campaign.targetDifficulty ? (
                            <span className="campaignMetaChip gold">{campaign.targetDifficulty.toUpperCase()}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {campaign.targetNotes ? <div className="campaignDesc compact secondary">{campaign.targetNotes}</div> : null}
                    </>
                  ) : null}

                  {campaign.tags.length > 0 ? (
                    <div className="campaignMetaRow compact">
                      {campaign.tags.slice(0, 5).map((tag) => (
                        <span key={`${campaign.id}-${tag}`} className={`campaignMetaChip ${isResearch ? "gold" : ""}`}>{tag}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="campaignActionRow compact">
                    {locked ? (
                      <button className="primaryBtn" type="button" onClick={handleUpgrade} disabled={busyCheckout}>
                        {busyCheckout ? "Opening Stripe…" : "Upgrade"}
                      </button>
                    ) : joined ? (
                      <button
                        className="ghostBtn"
                        type="button"
                        onClick={() => handleLeaveCampaign(campaign)}
                        disabled={campaignActionBusy === `leave-${campaign.id}` || !campaignMembershipsEnabled}
                      >
                        {campaignActionBusy === `leave-${campaign.id}` ? "Leaving…" : isResearch ? "Leave assignment" : "Leave campaign"}
                      </button>
                    ) : (
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={() => handleJoinCampaign(campaign)}
                        disabled={campaignActionBusy === `join-${campaign.id}` || !campaignMembershipsEnabled || isFull}
                      >
                        {campaignActionBusy === `join-${campaign.id}` ? "Joining…" : isResearch ? (isFull ? "Campaign Full" : "Join Research") : "Join campaign"}
                      </button>
                    )}

                    {(!locked && teamsEnabled && teams.length > 0 && isResearch && isPro) ? (
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
                          <option key={`${campaign.id}-${team.id}`} value={team.id}>{team.name}</option>
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
      ) : null}

      {(!isMobileCollective || mobileTab === "teams") ? (
      <section className="panel">
        <div className="campaignSectionHeader">
          <div>
            <div className="sectionKicker">TEAM CONTROL</div>
            <h2 className="sectionTitle">Create, invite, and coordinate teams</h2>
            <p className="sectionHint">
              Teams can now act like real units: create the team, invite members, manage the roster, and keep a lightweight mission thread inside the Collective.
            </p>
          </div>
          <span className="statusBadge">
            {!isPro ? "Subscriber only" : teamsLoading ? "Syncing…" : `${teams.length} teams · ${pendingInviteCount} pending invites`}
          </span>
        </div>

        {!isPro ? (
          <div className="emptyState">
            Team controls are available to Research Collective members only.
          </div>
        ) : (
          <>
            <div className="teamOpsGrid">
              <div className="teamCreateCard">
                <div className="sectionKicker">NEW TEAM</div>
                <div className="teamGrid">
                  <label className="fieldBlock">
                    <span>Team name</span>
                    <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Helvarix Deep Sky Unit" />
                  </label>
                  <label className="fieldBlock">
                    <span>Max members</span>
                    <input value={createMaxMembers} onChange={(e) => setCreateMaxMembers(e.target.value)} inputMode="numeric" />
                  </label>
                </div>

                <label className="fieldBlock">
                  <span>Description</span>
                  <textarea
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe the purpose, target style, or instruments this team uses."
                  />
                </label>

                <label className="checkboxRow">
                  <input type="checkbox" checked={createPrivate} onChange={(e) => setCreatePrivate(e.target.checked)} />
                  <span>Private team</span>
                </label>

                <div className="buttonRow">
                  <button className="primaryBtn" type="button" onClick={handleCreateTeam} disabled={teamActionBusy === "create-team"}>
                    {teamActionBusy === "create-team" ? "Creating…" : "Create team"}
                  </button>
                </div>
              </div>

              <div className="teamCreateCard">
                <div className="sectionKicker">JOIN WITH INVITE</div>
                <div className="collectiveToolBody">
                  Paste an invite token from a team owner. Links with <code>?team_invite=...</code> also auto-fill this field.
                </div>
                <label className="fieldBlock">
                  <span>Invite token</span>
                  <input
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value.replace(/^.*team_invite=/, ""))}
                    placeholder="Paste invite token"
                  />
                </label>
                <div className="buttonRow">
                  <button className="primaryBtn" type="button" onClick={handleAcceptInvite} disabled={teamActionBusy === "accept-invite"}>
                    {teamActionBusy === "accept-invite" ? "Joining…" : "Accept invite"}
                  </button>
                </div>
                {!teamInvitesEnabled ? (
                  <div className="emptyState">
                    Invite table not detected yet. Run the SQL below before testing invite links.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="teamList">
              {teamsLoading ? (
                <div className="emptyState">Loading teams…</div>
              ) : teams.length === 0 ? (
                <div className="emptyState">No teams are attached to your account yet.</div>
              ) : (
                teams.map((team) => {
                  const isOwner = team.owner_id === sessionUser?.id;
                  const membership = myTeamMemberships[team.id];
                  const isEditing = editingTeamId === team.id;
                  const roster = teamRosters[team.id] ?? [];
                  const activeInvites = (teamInvites[team.id] ?? []).filter((invite) => String(invite.status ?? "pending").toLowerCase() === "pending");
                  const messages = teamMessages[team.id] ?? [];
                  const memberCount = roster.length;
                  const membershipRole = String(membership?.role ?? membership?.status ?? "member").toUpperCase();

                  return (
                    <div key={team.id} className="teamCard">
                      <div className="campaignTop">
                        <div>
                          <div className="campaignTitle">{team.name}</div>
                          <div className="campaignDesc">{team.description || "No team description set yet."}</div>
                        </div>
                        <div className="campaignMetaRow">
                          <span className="campaignMetaChip">{isOwner ? "OWNER" : membershipRole}</span>
                          <span className="campaignMetaChip">{team.is_private ? "PRIVATE" : "PUBLIC"}</span>
                          <span className="campaignMetaChip">{memberCount}/{team.max_members ?? "—"} MEMBERS</span>
                          {activeInvites.length > 0 ? <span className="campaignMetaChip gold">{activeInvites.length} PENDING</span> : null}
                        </div>
                      </div>

                      {isOwner ? (
                        isEditing ? (
                          <div className="ownerEditGrid">
                            <label className="fieldBlock">
                              <span>Team name</span>
                              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </label>
                            <label className="fieldBlock">
                              <span>Max members</span>
                              <input value={editMaxMembers} onChange={(e) => setEditMaxMembers(e.target.value)} inputMode="numeric" />
                            </label>
                            <label className="fieldBlock ownerFullWidth">
                              <span>Description</span>
                              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
                            </label>
                            <label className="checkboxRow ownerFullWidth">
                              <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} />
                              <span>Private team</span>
                            </label>
                            <div className="buttonRow ownerFullWidth">
                              <button className="primaryBtn" type="button" onClick={() => handleSaveTeam(team.id)} disabled={teamActionBusy === `save-${team.id}`}>
                                {teamActionBusy === `save-${team.id}` ? "Saving…" : "Save team"}
                              </button>
                              <button className="ghostBtn" type="button" onClick={cancelEditingTeam}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="buttonRow">
                            <button className="ghostBtn" type="button" onClick={() => startEditingTeam(team)}>Edit team</button>
                            <button className="dangerBtn" type="button" onClick={() => handleLeaveTeam(team)} disabled={teamActionBusy === `delete-${team.id}`}>
                              {teamActionBusy === `delete-${team.id}` ? "Deleting…" : "Delete team"}
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="buttonRow">
                          <button className="ghostBtn" type="button" onClick={() => handleLeaveTeam(team)} disabled={teamActionBusy === `leave-${team.id}`}>
                            {teamActionBusy === `leave-${team.id}` ? "Leaving…" : "Leave team"}
                          </button>
                        </div>
                      )}

                      <div className="teamModuleGrid">
                        <div className="teamSubpanel">
                          <div className="sectionKicker">ROSTER</div>
                          {roster.length === 0 ? (
                            <div className="emptyState">No active members loaded yet.</div>
                          ) : (
                            <div className="teamRoster">
                              {roster.map((member) => {
                                const profileName = displayProfileName(teamProfiles[member.user_id], member.user_id);
                                const roleLabel = String(member.role ?? member.status ?? "member").toUpperCase();
                                const canRemove = isOwner && member.user_id !== sessionUser?.id;
                                return (
                                  <div key={`${team.id}-${member.user_id}`} className="teamRosterRow">
                                    <div>
                                      <strong>{profileName}</strong>
                                      <div className="campaignDesc compact">{member.user_id === sessionUser?.id ? "You" : member.user_id}</div>
                                    </div>
                                    <div className="teamRosterActions">
                                      <span className="campaignMetaChip">{roleLabel}</span>
                                      {canRemove ? (
                                        <button
                                          className="ghostBtn compactBtn"
                                          type="button"
                                          onClick={() => handleRemoveMember(team, member.user_id)}
                                          disabled={teamActionBusy === `remove-member-${team.id}-${member.user_id}`}
                                        >
                                          {teamActionBusy === `remove-member-${team.id}-${member.user_id}` ? "Removing…" : "Remove"}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="teamSubpanel">
                          <div className="sectionKicker">INVITES</div>
                          {!teamInvitesEnabled ? (
                            <div className="emptyState">Run the SQL migration to enable invites.</div>
                          ) : (
                            <>
                              {isOwner ? (
                                <>
                                  <div className="teamInviteComposer">
                                    <input
                                      value={inviteEmail[team.id] ?? ""}
                                      onChange={(e) => setInviteEmail((current) => ({ ...current, [team.id]: e.target.value }))}
                                      placeholder="Invite by email (optional)"
                                    />
                                    <button
                                      className="primaryBtn compactBtn"
                                      type="button"
                                      onClick={() => handleCreateInvite(team)}
                                      disabled={teamActionBusy === `invite-${team.id}`}
                                    >
                                      {teamActionBusy === `invite-${team.id}` ? "Creating…" : "Create invite"}
                                    </button>
                                  </div>
                                  <div className="collectiveToolBody">
                                    Leave the email blank to generate a generic invite link.
                                  </div>
                                </>
                              ) : null}

                              {activeInvites.length === 0 ? (
                                <div className="emptyState">No pending invites.</div>
                              ) : (
                                <div className="inviteList">
                                  {activeInvites.map((invite) => (
                                    <div key={invite.id} className="teamRosterRow">
                                      <div>
                                        <strong>{invite.invited_email || "Generic invite link"}</strong>
                                        <div className="campaignDesc compact">
                                          Token: {invite.token.slice(0, 18)}… · expires {formatDate(invite.expires_at)}
                                        </div>
                                      </div>
                                      {isOwner ? (
                                        <button
                                          className="ghostBtn compactBtn"
                                          type="button"
                                          onClick={() => handleRevokeInvite(team, invite.id)}
                                          disabled={teamActionBusy === `revoke-${invite.id}`}
                                        >
                                          {teamActionBusy === `revoke-${invite.id}` ? "Revoking…" : "Revoke"}
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="teamSubpanel">
                        <div className="sectionKicker">TEAM CHANNEL</div>
                        {!teamMessagesEnabled ? (
                          <div className="emptyState">Run the SQL migration to enable team chat.</div>
                        ) : (
                          <>
                            <div className="teamMessageComposer">
                              <textarea
                                value={teamMessageDrafts[team.id] ?? ""}
                                onChange={(e) => setTeamMessageDrafts((current) => ({ ...current, [team.id]: e.target.value }))}
                                rows={3}
                                placeholder="Post planning notes, target updates, filter choices, or handoff instructions."
                              />
                              <div className="buttonRow">
                                <button
                                  className="primaryBtn compactBtn"
                                  type="button"
                                  onClick={() => handleSendTeamMessage(team)}
                                  disabled={teamActionBusy === `send-message-${team.id}`}
                                >
                                  {teamActionBusy === `send-message-${team.id}` ? "Sending…" : "Post message"}
                                </button>
                              </div>
                            </div>

                            {messages.length === 0 ? (
                              <div className="emptyState">No messages yet.</div>
                            ) : (
                              <div className="messageList">
                                {messages.slice(0, 8).map((message) => (
                                  <div key={message.id} className="messageCard">
                                    <div className="messageCardTop">
                                      <strong>{displayProfileName(teamProfiles[message.user_id], message.user_id)}</strong>
                                      <span className="campaignMetaChip">{formatRelativeTime(message.created_at)}</span>
                                    </div>
                                    <div className="collectiveToolBody">{message.body}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>
      ) : null}
    </div>
  );
}

const styles = `
.collectivePage{
  color:rgba(255,255,255,.94);
  padding:24px 18px 110px;
  background:
    radial-gradient(900px 540px at 8% -10%, rgba(56,242,255,.12), transparent 55%),
    radial-gradient(900px 540px at 100% 0%, rgba(157,124,255,.16), transparent 50%),
    linear-gradient(180deg, #040711 0%, #070b14 40%, #050812 100%);
}
.pageStack{
  max-width:1180px;
  margin:0 auto;
  display:grid;
  gap:18px;
}
.panel{
  min-width:0;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.08);
  background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
  border-radius:24px;
  box-shadow:0 18px 50px rgba(0,0,0,.26);
  backdrop-filter:blur(16px);
  padding:22px;
}
.loadingPanel{ min-height:220px; display:grid; align-content:center; gap:10px; }
.heroTitle{ margin:10px 0 0; font-size:34px; line-height:1.08; }
.sectionKicker{ font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:rgba(255,255,255,.54); font-weight:800; }
.sectionTitle{ margin:8px 0 0; font-size:26px; }
.sectionHint{ margin-top:10px; color:rgba(255,255,255,.66); line-height:1.6; max-width:840px; }
.stateText{ color:rgba(255,255,255,.7); }
.collectiveHero{ overflow:hidden; position:relative; padding:28px; background:
  radial-gradient(circle at top right, rgba(242,191,87,.13), transparent 28%),
  radial-gradient(circle at top left, rgba(92,214,255,.10), transparent 32%),
  linear-gradient(180deg, rgba(15,24,46,.96), rgba(9,16,31,.92)); }
.collectiveHeroGrid{ display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:18px; align-items:stretch; position:relative; z-index:1; }
.collectiveKicker{ color:${SOLAR_GOLD}; font-size:12px; letter-spacing:.28em; text-transform:uppercase; font-weight:800; }
.collectiveLead{ max-width:820px; margin-top:14px; color:rgba(255,255,255,.72); line-height:1.7; }
.collectiveHeroMeta{ display:flex; flex-wrap:wrap; gap:12px; margin-top:18px; }
.goldBadge{ display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:999px; border:1px solid rgba(242,191,87,.30); background:rgba(242,191,87,.10); color:#ffe4a5; font-weight:700; }
.collectiveStatusCard{ min-height:100%; min-width:0; width:100%; display:grid; gap:16px; padding:22px; border-radius:24px; border:1px solid rgba(242,191,87,.16); background:linear-gradient(180deg, rgba(15,24,46,.88), rgba(9,14,28,.94)); overflow:hidden; }
.collectiveMobileHeader{ display:none; }
.collectiveMobileHeaderTop{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.collectiveMobileHeaderTitle{ margin:8px 0 0; font-size:24px; line-height:1.08; }
.collectiveMobileManageBtn{ white-space:nowrap; }
.collectivePaywallOverlay{ display:none; }
.collectivePaywallScrim{ position:absolute; inset:0; background:rgba(2,6,16,.72); backdrop-filter:blur(8px); }
.collectivePaywallCard{ position:relative; z-index:1; width:min(100%, 420px); border-color:rgba(242,191,87,.22); background:linear-gradient(180deg, rgba(15,24,46,.96), rgba(9,14,28,.98)); box-shadow:0 24px 70px rgba(0,0,0,.45); }
.collectivePaywallTitle{ margin:10px 0 0; font-size:28px; line-height:1.04; }
.collectivePaywallText{ margin-top:12px; color:rgba(255,255,255,.72); line-height:1.65; }
.collectivePaywallActions{ margin-top:18px; display:grid; }
.collectiveStatusTop{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap; min-width:0; }
.collectivePrice{ font-size:34px; font-weight:800; line-height:1; }
.collectivePrice small{ font-size:14px; color:rgba(255,255,255,.64); font-weight:600; margin-left:4px; }
.collectiveMiniList{ display:grid; gap:12px; min-width:0; }
.collectiveMiniRow{ display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:14px; padding:12px 14px; border-radius:14px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); min-width:0; }
.collectiveMiniRow span{ color:rgba(255,255,255,.66); min-width:0; overflow-wrap:anywhere; }
.collectiveMiniRow strong{ text-align:right; max-width:100%; overflow-wrap:anywhere; }
.statusBadge{ display:inline-flex; align-items:center; gap:8px; padding:9px 12px; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); font-weight:700; }
.statusLive{ color:#94f5c7; }
.statusLocked{ color:#ffcf78; }
.alert{ padding:14px 16px; border-radius:16px; border:1px solid rgba(255,255,255,.08); }
.alert.error{ background:rgba(255,107,125,.11); border-color:rgba(255,107,125,.28); color:#ffc3cc; }
.alert.success{ background:rgba(108,255,183,.10); border-color:rgba(108,255,183,.24); color:#c5ffe5; }
.collectiveMetricGrid{ display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:18px; }
.collectiveMetricCard{ padding:18px; border-radius:18px; background:rgba(255,255,255,.03); border:1px solid rgba(92,214,255,.12); }
.metricLabel{ color:rgba(255,255,255,.60); font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
.collectiveMetricValue{ margin-top:8px; font-size:28px; font-weight:800; }
.collectiveToolsGrid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; margin-top:18px; }
.premiumToolGrid{ grid-template-columns:repeat(3, minmax(0,1fr)); }
.collectiveToolCard{ padding:18px; border-radius:18px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07); display:grid; gap:8px; }
.collectiveToolCard.premium{ border-color:rgba(242,191,87,.18); background:
  radial-gradient(circle at top right, rgba(242,191,87,.08), transparent 38%),
  linear-gradient(180deg, rgba(18,22,38,.94), rgba(9,14,29,.90)); }
.collectiveToolValue{ font-size:18px; font-weight:800; }
.collectiveToolValue.live{ color:#94f5c7; }
.collectiveToolValue.locked{ color:#ffcf78; }
.collectiveToolValue.premium{ color:#ffe4a5; }
.collectiveToolBody{ color:rgba(255,255,255,.66); line-height:1.6; }
.campaignSectionHeader{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.campaignGrid,.teamList,.campaignBoardGrid{ display:grid; gap:14px; margin-top:18px; }
.campaignBoardGrid{ grid-template-columns:repeat(3, minmax(0,1fr)); align-items:start; }
.campaignCard,.teamCard,.teamCreateCard{ padding:18px; border-radius:18px; background:rgba(8,14,30,.72); border:1px solid rgba(255,255,255,.06); display:grid; gap:14px; }
.teamOpsGrid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; margin-top:18px; }
.teamModuleGrid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
.teamSubpanel{ padding:16px; border-radius:16px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); display:grid; gap:12px; }
.teamRoster,.inviteList,.messageList{ display:grid; gap:10px; }
.teamRosterRow,.messageCard{ padding:12px 14px; border-radius:14px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); }
.teamRosterRow{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.teamRosterActions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.teamInviteComposer,.teamMessageComposer{ display:grid; gap:10px; }
.messageCardTop{ display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.compactBtn{ padding:10px 12px; }
.campaignBoardCard{ padding:16px; gap:12px; height:100%; align-content:start; }
.emptyCampaignCard{ grid-column:1 / -1; }
.campaignBoardTop{ display:grid; gap:10px; }
.campaignBoardHeaderText{ min-width:0; }
.campaignCard.premium{ border:1px solid rgba(242,191,87,.22); background:
  radial-gradient(circle at top right, rgba(242,191,87,.08), transparent 32%),
  linear-gradient(180deg, rgba(18,22,38,.95), rgba(9,14,29,.92)); }
.campaignCard.locked{ opacity:.92; }
.campaignTop{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.campaignTitle{ font-size:22px; font-weight:800; }
.campaignTitle.compact{ font-size:16px; line-height:1.25; }
.campaignDesc{ color:rgba(255,255,255,.68); line-height:1.65; margin-top:6px; max-width:840px; }
.campaignDesc.compact{ margin-top:0; font-size:13px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.campaignDesc.compact.secondary{ -webkit-line-clamp:3; }
.campaignMetaRow{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.campaignMetaRow.compact{ gap:6px; }
.campaignMetaChip{ display:inline-flex; align-items:center; border-radius:999px; padding:8px 10px; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); }
.campaignMetaChip.gold{ color:#ffe4a5; border-color:rgba(242,191,87,.22); background:rgba(242,191,87,.10); }
.campaignMetaChip.locked{ color:#ffd494; }
.campaignMetaChip.full{ color:#ffb2ba; border-color:rgba(255,107,125,.28); background:rgba(255,107,125,.10); }
.toneCyan{ color:#8feeff; border-color:rgba(92,214,255,.22); background:rgba(92,214,255,.10); }
.toneViolet{ color:#ccb8ff; border-color:rgba(157,124,255,.22); background:rgba(157,124,255,.10); }
.toneAmber{ color:#ffe0a2; border-color:rgba(242,191,87,.22); background:rgba(242,191,87,.10); }
.campaignStatRow{ display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
.campaignBoardStats{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
.campaignMiniStat{ padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.03); min-width:0; }
.campaignStat{ padding:14px; border-radius:14px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.03); }
.campaignStatLabel{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.55); }
.campaignStatValue{ margin-top:6px; font-weight:700; }
.campaignActionRow,.buttonRow{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.campaignActionRow.compact{ margin-top:auto; }
.primaryBtn,.ghostBtn,.dangerBtn,.campaignAssignSelect,input,textarea{ border-radius:14px; font:inherit; }
.primaryBtn,.ghostBtn,.dangerBtn{ border:1px solid transparent; padding:12px 16px; font-weight:800; cursor:pointer; }
.primaryBtn{ background:linear-gradient(180deg, rgba(242,191,87,.95), rgba(214,155,45,.95)); color:#111522; }
.ghostBtn{ background:rgba(255,255,255,.04); color:rgba(255,255,255,.92); border-color:rgba(255,255,255,.10); }
.dangerBtn{ background:rgba(255,107,125,.12); color:#ffc3cc; border-color:rgba(255,107,125,.24); }
.primaryBtn:disabled,.ghostBtn:disabled,.dangerBtn:disabled{ opacity:.6; cursor:not-allowed; }
.campaignAssignSelect,input,textarea{ width:100%; background:rgba(255,255,255,.04); color:rgba(255,255,255,.95); border:1px solid rgba(255,255,255,.10); padding:12px 14px; }
select.campaignAssignSelect{ max-width:240px; }
textarea{ resize:vertical; min-height:96px; }
.fieldBlock{ display:grid; gap:8px; }
.fieldBlock span{ color:rgba(255,255,255,.64); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
.checkboxRow{ display:flex; gap:10px; align-items:center; color:rgba(255,255,255,.86); }
.checkboxRow input{ width:18px; height:18px; padding:0; }
.teamGrid,.ownerEditGrid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
.ownerFullWidth{ grid-column:1 / -1; }
.emptyState{ padding:18px; border-radius:16px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); color:rgba(255,255,255,.70); }
.collectiveMobileTabsPanel{ display:none; }
.collectiveMobileTabs{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
.collectiveMobileTab{
  min-width:0;
  min-height:44px;
  padding:11px 8px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.03);
  color:rgba(255,255,255,.92);
  font:inherit;
  font-weight:800;
  font-size:13px;
  line-height:1.15;
  letter-spacing:0;
  white-space:normal;
  overflow-wrap:anywhere;
  text-align:center;
  cursor:pointer;
}
.collectiveMobileTab.active{
  border-color:rgba(242,191,87,.30);
  background:rgba(242,191,87,.12);
  color:#ffe4a5;
  box-shadow:0 0 0 1px rgba(242,191,87,.12) inset;
}
@media (max-width: 640px){
  .collectiveMobileTabs{ gap:6px; }
  .collectiveMobileTab{ padding:10px 6px; font-size:12px; }
}
@media (max-width: 1180px){
  .collectiveHeroGrid{ grid-template-columns:1fr; }
  .premiumToolGrid,.campaignBoardGrid,.teamOpsGrid,.teamModuleGrid{ grid-template-columns:repeat(2, minmax(0,1fr)); }
}
@media (max-width: 980px){
  .collectiveHeroGrid,.campaignStatRow,.teamGrid,.ownerEditGrid,.collectiveToolsGrid,.campaignBoardGrid,.campaignBoardStats,.teamOpsGrid,.teamModuleGrid{ grid-template-columns:1fr; }
  .collectiveMiniRow{ grid-template-columns:1fr; }
  .collectiveMiniRow strong{ text-align:left; }
  select.campaignAssignSelect{ max-width:none; }
  .collectiveMobileTabsPanel{ display:block; padding:14px; position:relative; z-index:4; }
  .collectiveMetricGrid{ grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
  .collectiveMetricCard{ padding:14px; }
  .collectiveMetricValue{ font-size:22px; }
  .panel{ padding:18px; border-radius:20px; }
  .campaignCard,.teamCard,.teamCreateCard,.collectiveToolCard{ padding:14px; border-radius:16px; }
}
@media (max-width: 640px){
  .collectiveHero{ display:none; }
  .collectiveMobileHeader{ display:block; position:relative; z-index:4; }
  .collectiveMobileHeaderTop{ flex-direction:column; align-items:stretch; }
  .collectiveMobileHeaderTitle{ font-size:22px; }
  .collectiveMobileManageBtn{ width:100%; }
  .collectivePaywallOverlay{ display:grid; place-items:center; position:fixed; inset:0; padding:86px 16px 24px; z-index:30; }
  .collectivePage.paywalledMobile{ overflow:hidden; }
}
`;
