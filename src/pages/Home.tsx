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
  tone: "cyan" | "violet" | "neutral";
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
      0.000387933 * (n / 36525) ** 2
  );
  const LST = wrap360(GMST + lonDeg);

  const ra = Math.atan2(
    Math.cos(toRad(eps)) * Math.sin(toRad(lambda)),
    Math.cos(toRad(lambda))
  );
  const raDeg = wrap360(toDeg(ra));
  const ha = wrap360(LST - raDeg);

  const lat = toRad(latDeg);
  const H = toRad(ha);

  const alt = Math.asin(
    Math.sin(lat) * Math.sin(decl) +
      Math.cos(lat) * Math.cos(decl) * Math.cos(H)
  );
  return toDeg(alt);
}

function airmassKastenYoung(zDeg: number) {
  if (zDeg >= 90) return null;
  const cosZ = Math.cos(toRad(zDeg));
  return 1 / (cosZ + 0.50572 * Math.pow(96.07995 - zDeg, -1.6364));
}

function skyStateFromSunAlt(altDeg: number): EarthTelemetry["skyState"] {
  if (altDeg > 0) return "DAYLIGHT";
  if (altDeg > -6) return "CIVIL";
  if (altDeg > -12) return "NAUTICAL";
  if (altDeg > -18) return "ASTRONOMICAL";
  return "NIGHT";
}

function fmtHM(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = String(h).padStart(2, "0");
  const m2 = String(mm).padStart(2, "0");
  return `${hh}H ${m2}M`;
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,cloud_cover,pressure_msl,wind_speed_10m` +
    `&hourly=cloud_cover` +
    `&forecast_hours=9` +
    `&timezone=auto`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Weather fetch failed: ${r.status}`);
  const j = await r.json();

  const cur = j?.current ?? {};
  const hourly = j?.hourly ?? {};
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const clouds: number[] = Array.isArray(hourly?.cloud_cover)
    ? hourly.cloud_cover
    : [];

  return {
    cloudCoverPct:
      typeof cur?.cloud_cover === "number" ? cur.cloud_cover : undefined,
    tempC:
      typeof cur?.temperature_2m === "number" ? cur.temperature_2m : undefined,
    pressureHPa:
      typeof cur?.pressure_msl === "number" ? cur.pressure_msl : undefined,
    windMS:
      typeof cur?.wind_speed_10m === "number"
        ? cur.wind_speed_10m / 3.6
        : undefined,
    hourlyTimes: times,
    hourlyClouds: clouds,
  };
}

async function fetchNOAAKp(): Promise<number | null> {
  const url = `https://services.swpc.noaa.gov/json/planetary_k_index_1m.json`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  if (!Array.isArray(j) || j.length === 0) return null;
  const last = j[j.length - 1];
  const kp = Number(last?.kp_index);
  return Number.isFinite(kp) ? kp : null;
}

function kpLabel(kp: number | null): EarthTelemetry["kpLabel"] {
  if (kp == null) return "UNKNOWN";
  if (kp < 4) return "LOW";
  if (kp < 6) return "MODERATE";
  if (kp < 8) return "HIGH";
  return "SEVERE";
}

function rankFromOI(oi: number) {
  const tiers = [
    { at: 0, name: "FIELD OBSERVER" },
    { at: 2500, name: "ARRAY OPERATOR" },
    { at: 10000, name: "NETWORK SPECIALIST" },
    { at: 25000, name: "SECTOR ANALYST" },
    { at: 50000, name: "TELEMETRY COMMAND" },
    { at: 100000, name: "GLOBAL COORDINATOR" },
  ];
  let i = 0;
  while (i + 1 < tiers.length && oi >= tiers[i + 1].at) i++;
  const cur = tiers[i];
  const next = tiers[Math.min(i + 1, tiers.length - 1)];
  const nextAt = next.at;
  const remaining = Math.max(0, nextAt - oi);
  return { cur: cur.name, next: next.name, nextAt, remaining };
}

export default function HomePage() {
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
      } else {
        setProfile(null);
        setUserSubmissions(0);
      }

      setLoading(false);
    }

    boot();

    const { data: authSub } = supabase.auth.onAuthStateChange((_evt, s) => {
      const uid = s?.user?.id ?? null;
      setSessionUserId(uid);
      boot();
    });

    return () => {
      alive = false;
      authSub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    realtimeRef.current?.unsubscribe();

    const ch = supabase
      .channel("hga_home_feed")
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
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (!error) setProfile((data as ProfileRow) ?? null);
  }

  async function loadCampaigns() {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_active", true)
      .order("end_at", { ascending: true });

    if (!error) setCampaigns((data as CampaignRow[]) ?? []);
  }

  async function loadRecent() {
    const { data, error } = await supabase
      .from("observations")
      .select("id,user_id,created_at,mode,target,tags,image_url")
      .order("created_at", { ascending: false })
      .limit(12);

    if (!error) setRecentObs((data as ObservationRow[]) ?? []);
  }

  async function loadUserSubmissionCount(uid: string) {
    const { count } = await supabase
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);

    setUserSubmissions(count ?? 0);
  }

  useEffect(() => {
    let alive = true;

    async function compute() {
      const uid = sessionUserId;
      const next: Record<string, number> = {};

      await Promise.all(
        campaigns.map(async (c) => {
          const isGlobal = c.cadence === "GLOBAL";

          let q = supabase
            .from("observations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", c.start_at)
            .lte("created_at", c.end_at);

          const tags = (c.tags ?? []).filter(Boolean);
          if (tags.length) {
            // @ts-ignore overlaps exists in supabase-js
            q = q.overlaps("tags", tags);
          }

          if (!isGlobal && uid) q = q.eq("user_id", uid);
          if (!isGlobal && !uid) {
            next[c.id] = 0;
            return;
          }

          const { count, error } = await q;
          if (error) {
            next[c.id] = 0;
            return;
          }

          const goal = isGlobal ? c.goal_global ?? 100 : c.goal_user ?? 1;
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
      if (!("geolocation" in navigator)) {
        throw new Error("Geolocation isn’t available in this browser.");
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
        });
      });

      const lat = Number(pos.coords.latitude.toFixed(6));
      const lon = Number(pos.coords.longitude.toFixed(6));

      const now = new Date();
      const sunAltNowDeg = solarAltitudeDeg(now, lat, lon);
      const skyState = skyStateFromSunAlt(sunAltNowDeg);

      let wx: Awaited<ReturnType<typeof fetchOpenMeteo>> | null = null;
      try {
        wx = await fetchOpenMeteo(lat, lon);
      } catch {
        wx = null;
      }

      let kp: number | null = null;
      try {
        kp = await fetchNOAAKp();
      } catch {
        kp = null;
      }

      const hours: string[] = [];
      const seeing: number[] = [];
      const airm: number[] = [];

      const clouds = wx?.hourlyClouds ?? [];
      const airmassProxy = airmassKastenYoung(30) ?? 1.15;

      for (let i = 0; i < 8; i++) {
        const t = new Date(now.getTime() + i * 60 * 60 * 1000);
        hours.push(
          t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );

        const cc = clouds[i] ?? wx?.cloudCoverPct ?? 50;
        const seeingArcsec =
          1.0 + (Math.max(0, Math.min(100, cc)) / 100) * 2.5;
        seeing.push(seeingArcsec);
        airm.push(airmassProxy);
      }

      const ccNow = wx?.cloudCoverPct;
      const photonFluxStabilityPct =
        typeof ccNow === "number"
          ? Math.round(100 - Math.max(0, Math.min(100, ccNow)))
          : undefined;

      const stepMs = 5 * 60 * 1000;
      let startNight: Date | null = null;
      let endNight: Date | null = null;

      const horizon = now.getTime() + 24 * 60 * 60 * 1000;

      for (let t = now.getTime(); t < horizon; t += stepMs) {
        const alt = solarAltitudeDeg(new Date(t), lat, lon);
        if (alt <= -18) {
          startNight = new Date(t);
          break;
        }
      }
      if (startNight) {
        for (let t = startNight.getTime(); t < horizon; t += stepMs) {
          const alt = solarAltitudeDeg(new Date(t), lat, lon);
          if (alt > -18) {
            endNight = new Date(t);
            break;
          }
        }
      }

      const optimalCollectionStartLocal = startNight ? fmtHM(startNight) : null;
      const nightRemaining =
        startNight && endNight
          ? fmtDuration(
              endNight.getTime() -
                Math.max(now.getTime(), startNight.getTime())
            )
          : null;

      const tel: EarthTelemetry = {
        lat,
        lon,
        elevM: pos.coords.altitude ?? null,
        timeLocal: now.toLocaleString(),

        cloudCoverPct: wx?.cloudCoverPct,
        tempC: wx?.tempC,
        pressureHPa: wx?.pressureHPa,
        windMS: wx?.windMS,

        kp,
        kpLabel: kpLabel(kp),

        photonFluxStabilityPct,
        sunAltNowDeg,
        skyState,

        optimalCollectionStartLocal,
        nightRemaining,

        hours,
        airmass: airm,
        seeingArcsec: seeing,
      };

      setEarth(tel);

      if (sessionUserId) {
        await supabase
          .from("profiles")
          .upsert({ id: sessionUserId, lat, lon }, { onConflict: "id" });
        loadProfile(sessionUserId);
      }
    } catch (e: any) {
      setEarth(null);
      setEarthErr(e?.message ?? "Could not load earth sector telemetry.");
    } finally {
      setEarthBusy(false);
    }
  }

  const callsign = profile?.callsign?.trim()
    ? profile.callsign
    : sessionUserId
    ? "Operator"
    : "Guest";
  const role = profile?.role?.trim()
    ? profile.role
    : sessionUserId
    ? "DEEP SPACE CONTRIBUTOR"
    : "UNAUTHENTICATED NODE";

  const oi = profile?.observation_index ?? 0;
  const ci = profile?.campaign_impact ?? 0;
  const streak = profile?.streak_days ?? 0;

  const rank = useMemo(() => rankFromOI(oi), [oi]);
  const progPct = rank.nextAt > 0 ? clamp01(oi / rank.nextAt) : 0;

  const campaignUI = useMemo(() => {
    const pick = (cad: CampaignCadence) =>
      campaigns.find((c) => c.cadence === cad) ?? null;

    const daily = pick("DAILY");
    const weekly = pick("WEEKLY");
    const global = pick("GLOBAL");

    function map(c: CampaignRow | null, accent: "cyan" | "violet") {
      if (!c) return null;
      return {
        key: c.id,
        cadence: c.cadence,
        title: c.title,
        desc: c.description ?? "",
        endsIn: c.cadence === "GLOBAL" ? "ACTIVE" : fmtEndsIn(c.end_at),
        progress: campaignProgress[c.id] ?? 0,
        accent,
      };
    }

    return [map(daily, "cyan"), map(weekly, "violet"), map(global, "cyan")].filter(
      Boolean
    ) as Array<{
      key: string;
      cadence: CampaignCadence;
      title: string;
      desc: string;
      endsIn: string;
      progress: number;
      accent: "cyan" | "violet";
    }>;
  }, [campaigns, campaignProgress]);

  const sectorCoords = useMemo(() => {
    const lat = earth?.lat ?? profile?.lat;
    const lon = earth?.lon ?? profile?.lon;
    if (lat == null || lon == null) return "COORD: —";
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}${ns} / ${Math.abs(lon).toFixed(4)}${ew}`;
  }, [earth, profile]);

  const photonFlux = earth?.photonFluxStabilityPct;
  const photonFluxProgress = photonFlux != null ? clamp01(photonFlux / 100) : 0;

  const kpTxt = earth?.kpLabel ?? "UNKNOWN";
  const kpProgress = useMemo(() => {
    const kp = earth?.kp;
    if (kp == null) return 0.18;
    return clamp01(0.1 + (kp / 9) * 0.85);
  }, [earth]);

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
              <div className="metaPill mono">
                SUBMISSIONS: {sessionUserId ? userSubmissions : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="heroStats">
          <StatTile label="OBSERVATION INDEX" value={oi.toLocaleString()} />
          <StatTile label="CAMPAIGN IMPACT" value={ci.toLocaleString()} />
        </div>

        <div className="divider" />

        <div className="progressBlock">
          <div className="mono progressLabel">PROGRESSION PROTOCOL</div>
          <div className="progressRow">
            <div className="nextRank mono">Next: {rank.next}</div>
            <div className="remaining mono" style={{ color: "var(--cyan)" }}>
              {rank.remaining.toLocaleString()} OI REMAINING
            </div>
          </div>
          <ProgressBar value={progPct} accent="violet" />
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {!sessionUserId ? (
            <button
              className="btnPrimary"
              onClick={() => nav("/auth")}
              type="button"
            >
              SIGN IN / CREATE ACCOUNT
            </button>
          ) : (
            <>
              <button
                className="btnGhost"
                onClick={() => nav("/submit")}
                type="button"
              >
                SUBMIT
              </button>
              <button
                className="btnGhost"
                onClick={loadEarthSector}
                type="button"
                disabled={earthBusy}
              >
                {earthBusy ? "SCANNING…" : "LOAD EARTH SECTOR"}
              </button>
            </>
          )}

          {loading ? (
            <span className="mono" style={{ opacity: 0.7 }}>
              SYNCING…
            </span>
          ) : null}
        </div>
      </div>

      {/* ACTIVE CAMPAIGNS */}
      <div className="sectionTitle">
        <span className="dot cyan" />
        <div>
          <div className="h1">ACTIVE CAMPAIGNS</div>
          <div className="mono sub">Daily • Weekly • Global</div>
        </div>
      </div>

      <div className="card">
        <div className="mono kicker">CAMPAIGN OPERATIONS</div>
        <div className="h2">Active Campaigns</div>
        <div className="hr" />

        {!campaignUI.length ? (
          <div style={{ opacity: 0.75 }}>
            No active campaigns found. Create rows in{" "}
            <span className="mono">campaigns</span> (Supabase).
          </div>
        ) : (
          <div className="stack">
            {campaignUI.map((c) => (
              <div key={c.key} className="campaignCard">
                <div className="campaignTop">
                  <div
                    className="mono campaignCadence"
                    style={{
                      color:
                        c.cadence === "WEEKLY"
                          ? "var(--violet)"
                          : "var(--cyan)",
                    }}
                  >
                    {c.cadence}
                  </div>
                  <div className="mono campaignEnds">{c.endsIn}</div>
                </div>

                <div className="campaignTitle">{c.title}</div>
                <div className="campaignDesc">{c.desc}</div>

                <div style={{ marginTop: 14 }}>
                  <ProgressBar value={c.progress} accent={c.accent} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ✅ Styles kept intact. Peer-review-related styles can remain safely. */}
      <style>{`
        .page{display:flex;flex-direction:column;gap:18px;}
        .heroCard{padding:22px;}
        .heroTop{display:flex;gap:16px;align-items:center;}
        .heroMark{width:74px;height:74px;border-radius:18px;position:relative;overflow:hidden;background:rgba(9,20,40,.55);border:1px solid rgba(0,255,255,.18);}
        .markGrid{position:absolute;inset:-40%;background:
          linear-gradient(rgba(0,255,255,.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,255,.08) 1px, transparent 1px);
          background-size:14px 14px;transform:rotate(0.02turn);}
        .markGlyph{position:absolute;inset:0;display:grid;place-items:center;}
        .markGlyph:before{content:"";width:30px;height:30px;border-radius:999px;border:3px solid rgba(0,255,255,.65);box-shadow:0 0 22px rgba(0,255,255,.22);}
        .markGlyph:after{content:"";position:absolute;width:50px;height:50px;border-radius:999px;border:2px dashed rgba(160,110,255,.35);}
        .heroText{flex:1;min-width:0;}
        .kickerRow{letter-spacing:.22em;font-weight:800;font-size:12px;color:rgba(0,255,255,.75);display:flex;align-items:center;gap:10px;}
        .heroName{font-size:34px;font-weight:900;line-height:1.1;margin-top:6px;}
        .heroRole{margin-top:4px;color:rgba(0,255,255,.75);letter-spacing:.35em;}
        .heroMeta{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;}
        .metaPill{padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);}
        .divider{height:1px;background:rgba(255,255,255,.08);margin:16px 0;}
        .heroStats{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .statTile{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);}
        .statLabel{opacity:.7;letter-spacing:.22em;font-size:12px;}
        .statValue{margin-top:8px;font-size:34px;font-weight:900;color:rgba(255,255,255,.92);}
        .progressBlock{display:flex;flex-direction:column;gap:10px;}
        .progressLabel{opacity:.7;letter-spacing:.22em;font-size:12px;}
        .progressRow{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
        .progressWrap{height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;border:1px solid rgba(255,255,255,.06);}
        .progressFill{height:100%;border-radius:999px;}
        .sectionTitle{display:flex;gap:10px;align-items:flex-start;margin-top:6px;}
        .h1{font-size:34px;font-weight:900;letter-spacing:.02em;}
        .sub{opacity:.7;letter-spacing:.2em;text-transform:none;margin-top:6px;}
        .card{border-radius:22px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);backdrop-filter: blur(18px);box-shadow:0 18px 50px rgba(0,0,0,.35);padding:18px;}
        .kicker{opacity:.75;letter-spacing:.24em;font-weight:800;font-size:12px;}
        .h2{margin-top:6px;font-size:24px;font-weight:900;}
        .hr{height:1px;background:rgba(255,255,255,.08);margin:14px 0;}
        .stack{display:grid;gap:14px;}
        .campaignCard{border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(6,10,18,.35);padding:18px;}
        .campaignTop{display:flex;justify-content:space-between;align-items:center;gap:10px;}
        .campaignCadence{letter-spacing:.38em;font-weight:900;font-size:12px;}
        .campaignEnds{opacity:.6;letter-spacing:.3em;font-size:12px;}
        .campaignTitle{margin-top:8px;font-size:28px;font-weight:900;}
        .campaignDesc{opacity:.65;margin-top:6px;line-height:1.45;}
        .chartMock{border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(6,10,18,.25);padding:16px;}
        .chartLegend{opacity:.7;letter-spacing:.22em;font-weight:800;font-size:12px;display:flex;align-items:center;gap:10px;}
        .legendDot{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:8px;}
        .legendDot.violet{background:rgba(160,110,255,.8);box-shadow:0 0 18px rgba(160,110,255,.25);}
        .legendDot.cyan{background:rgba(0,255,255,.75);box-shadow:0 0 18px rgba(0,255,255,.22);}
        .chartBars{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-top:14px;align-items:end;height:220px;}
        .barCol{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:flex-end;}
        .bar{width:18px;border-radius:999px;}
        .bar.violet{background:linear-gradient(180deg, rgba(160,110,255,.85), rgba(160,110,255,.15));box-shadow:0 0 22px rgba(160,110,255,.18);}
        .bar.cyan{background:linear-gradient(180deg, rgba(0,255,255,.75), rgba(0,255,255,.12));box-shadow:0 0 22px rgba(0,255,255,.14);}
        .barLabel{opacity:.55;letter-spacing:.26em;font-size:11px;}
        .twoCol{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .miniPanel{border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(6,10,18,.25);padding:18px;text-align:center;}
        .miniLabel{opacity:.65;letter-spacing:.28em;font-weight:900;font-size:12px;}
        .miniValue{margin-top:10px;font-size:40px;font-weight:900;}
        .sectorPanel{border-radius:18px;border:1px solid rgba(0,255,255,.12);background:rgba(6,10,18,.25);padding:18px;}
        .sectorHead{display:flex;justify-content:space-between;gap:10px;align-items:center;}
        .sectorTitle{opacity:.8;letter-spacing:.28em;font-weight:900;font-size:12px;display:flex;align-items:center;gap:10px;}
        .diamond{display:inline-block;width:8px;height:8px;transform:rotate(45deg);background:rgba(0,255,255,.75);border-radius:2px;box-shadow:0 0 18px rgba(0,255,255,.18);}
        .sectorCoords{opacity:.55;letter-spacing:.22em;font-size:12px;}
        .sectorQuote{margin-top:12px;display:flex;gap:12px;align-items:flex-start;}
        .quoteBar{width:4px;border-radius:999px;background:rgba(160,110,255,.7);box-shadow:0 0 18px rgba(160,110,255,.2);}
        .quoteText{opacity:.7;font-style:italic;}
        .metricRow{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .metricCard{border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(6,10,18,.25);padding:14px;display:flex;flex-direction:column;gap:10px;position:relative;}
        .metricLabel{opacity:.65;letter-spacing:.28em;font-weight:900;font-size:11px;}
        .metricRight{position:absolute;right:14px;top:14px;}
        .zenith{border-radius:18px;border:1px solid rgba(160,110,255,.12);background:rgba(6,10,18,.25);padding:18px;}
        .zenHead{display:flex;justify-content:space-between;gap:10px;align-items:center;}
        .zenLegend{opacity:.7;letter-spacing:.22em;font-weight:800;font-size:12px;display:flex;align-items:center;}
        .zenChart{margin-top:12px;position:relative;height:240px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.12);overflow:hidden;}
        .zenGrid{position:absolute;inset:0;background:
          linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
          background-size:32px 32px;opacity:.6;}
        .zenLine{position:absolute;left:8%;right:8%;height:3px;border-radius:999px;top:32%;}
        .zenLine.violet{background:linear-gradient(90deg, rgba(160,110,255,.15), rgba(160,110,255,.85), rgba(0,255,255,.35));}
        .zenLine.cyan{top:48%;background:linear-gradient(90deg, rgba(0,255,255,.15), rgba(0,255,255,.8), rgba(160,110,255,.35));}
        .zenLine.dashed{background-size:18px 3px;background-image:linear-gradient(90deg, rgba(0,255,255,0) 0, rgba(0,255,255,0) 40%, rgba(0,255,255,.9) 40%, rgba(0,255,255,.9) 60%, rgba(0,255,255,0) 60%);opacity:.7;}
        .zenAxis{position:absolute;left:0;right:0;bottom:10px;text-align:center;opacity:.55;letter-spacing:.22em;font-size:12px;}
        .zenFooter{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:14px;}
        .zenTile{border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(6,10,18,.25);padding:14px;text-align:center;}
        .quickActions{display:flex;gap:10px;flex-wrap:wrap;}
        .chip{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(10,16,28,.35);letter-spacing:.16em;font-weight:900;font-size:12px;}
        .chip.cyan{border-color:rgba(0,255,255,.18);color:rgba(0,255,255,.85);}
        .chip.violet{border-color:rgba(160,110,255,.18);color:rgba(160,110,255,.85);}
        .chip.neutral{opacity:.75;}
        .dot{width:10px;height:10px;border-radius:999px;display:inline-block;margin-top:10px;}
        .dot.cyan{background:rgba(0,255,255,.8);box-shadow:0 0 18px rgba(0,255,255,.2);}
        .dot.violet{background:rgba(160,110,255,.8);box-shadow:0 0 18px rgba(160,110,255,.2);}
        @media (max-width: 860px){
          .heroStats{grid-template-columns:1fr;}
          .twoCol{grid-template-columns:1fr;}
          .metricRow{grid-template-columns:1fr;}
          .zenFooter{grid-template-columns:1fr;}
          .campaignTitle{font-size:24px;}
          .heroName{font-size:30px;}
        }
      `}</style>
    </div>
  );
}
