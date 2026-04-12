import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useDeviceProfile } from "../hooks/useDeviceProfile";

type LeaderboardTab = "oi" | "ci" | "ranks";
type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL" | "RESEARCH" | "COLLECTIVE" | "UNKNOWN";

type ProfileRow = {
  id: string;
  callsign: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  avatar_url?: string | null;
  observation_index?: number | null;
  campaign_impact?: number | null;
  is_pro?: boolean | null;
};

type CampaignRow = {
  id: string;
  title?: string | null;
  cadence?: string | null;
  tags?: string[] | null;
  is_active?: boolean | null;
};

type ObservationRow = {
  id: string;
  user_id: string;
  created_at: string;
  observing_at?: string | null;
  mode?: string | null;
  target?: string | null;
  notes?: string | null;
  description?: string | null;
  equipment?: string | null;
  tags?: string[] | null;
  image_url?: string | null;
  image_urls?: unknown;
  file_urls?: unknown;
  media_urls?: unknown;
  files?: unknown;
  uploads?: unknown;
  attachments?: unknown;
  verification_status?: string | null;
  status?: string | null;

  campaign_id?: string | null;
  campaign_title?: string | null;
  campaign_name?: string | null;
  campaign_scope?: string | null;
  campaign_type?: string | null;
  campaign_cadence?: string | null;
  [key: string]: unknown;
};

type UserScoreRow = {
  userId: string;
  callsign: string;
  role: string | null;
  location: string | null;
  avatarUrl: string | null;
  isPro: boolean;

  oi: number;
  ci: number;
  observations: number;
  verifiedCount: number;
  campaignCount: number;
  latestAt: string | null;

  sourceObservationCount: number;
  sourceMediaCount: number;
};

function extractStringArray(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStringArray(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return extractStringArray(JSON.parse(trimmed));
      } catch {
        return trimmed
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      }
    }

    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = [
      record.url,
      record.path,
      record.publicUrl,
      record.signedUrl,
      record.href,
      record.src,
      record.file_url,
      record.image_url,
      record.media_url,
      record.urls,
      record.files,
      record.name,
    ];
    return nested.flatMap((candidate) => extractStringArray(candidate));
  }

  return [];
}

function normalizeMedia(row: ObservationRow): string[] {
  const candidates = [
    row.image_url,
    row.image_urls,
    row.file_urls,
    row.media_urls,
    row.files,
    row.uploads,
    row.attachments,
  ];

  return Array.from(
    new Set(
      candidates
        .flatMap((candidate) => extractStringArray(candidate))
        .filter((value) => /^https?:\/\//i.test(value))
    )
  );
}

function normalizeTags(tags: unknown): string[] {
  return extractStringArray(tags).map((tag) => tag.toLowerCase().replace(/^#/, "").trim());
}

function normalizeStatus(row: ObservationRow) {
  const raw = String(row.verification_status ?? row.status ?? "pending")
    .trim()
    .toLowerCase();

  if (["verified", "approved", "confirmed"].includes(raw)) return "verified";
  if (["rejected", "flagged"].includes(raw)) return "flagged";
  if (["processing", "review", "reviewing", "in review"].includes(raw)) return "review";
  return "pending";
}

function toTitleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildLocation(profile: ProfileRow | null | undefined) {
  const parts = [profile?.city, profile?.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function getCadenceFromCampaign(
  row: ObservationRow,
  campaignsById: Map<string, CampaignRow>
): CampaignCadence {
  const direct =
    row.campaign_cadence ??
    row.campaign_scope ??
    row.campaign_type ??
    row.campaign_name ??
    row.campaign_title ??
    null;

  const tagText = normalizeTags(row.tags).join(" ");
  const campaign = row.campaign_id ? campaignsById.get(row.campaign_id) : null;
  const sourceText = [
    direct,
    campaign?.cadence,
    campaign?.title,
    extractStringArray(campaign?.tags).join(" "),
    tagText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (sourceText.includes("daily")) return "DAILY";
  if (sourceText.includes("weekly")) return "WEEKLY";
  if (sourceText.includes("global")) return "GLOBAL";
  if (sourceText.includes("collective")) return "COLLECTIVE";
  if (sourceText.includes("research")) return "RESEARCH";

  return "UNKNOWN";
}

function getObservationOI(row: ObservationRow, campaignsById: Map<string, CampaignRow>) {
  const media = normalizeMedia(row);
  const tags = normalizeTags(row.tags);
  const notes = String(row.notes ?? row.description ?? "").trim();
  const equipment = String(row.equipment ?? "").trim();
  const status = normalizeStatus(row);
  const cadence = getCadenceFromCampaign(row, campaignsById);
  const mode = String(row.mode ?? "").toLowerCase();

  let score = 40;

  if (mode === "visual") score += 22;
  else if (mode === "radio") score += 24;
  else score += 18;

  if (String(row.target ?? "").trim()) score += 12;
  if (row.observing_at) score += 8;
  if (equipment.length > 0) score += 12;
  if (notes.length >= 80) score += 16;
  else if (notes.length >= 30) score += 8;

  if (tags.length >= 1) score += 6;
  if (tags.length >= 3) score += 6;

  if (media.length >= 1) score += 18;
  if (media.length >= 3) score += 8;

  if (status === "verified") score = Math.round(score * 1.2);
  if (status === "review") score = Math.round(score * 1.05);
  if (status === "flagged") score = Math.round(score * 0.7);

  if (cadence === "DAILY") score = Math.round(score * 1.3);
  if (cadence === "WEEKLY") score = Math.round(score * 1.5);

  return Math.max(0, score);
}

function getObservationCI(row: ObservationRow, campaignsById: Map<string, CampaignRow>) {
  const media = normalizeMedia(row);
  const tags = normalizeTags(row.tags);
  const notes = String(row.notes ?? row.description ?? "").trim();
  const equipment = String(row.equipment ?? "").trim();
  const status = normalizeStatus(row);
  const cadence = getCadenceFromCampaign(row, campaignsById);

  const countsForCI =
    cadence === "GLOBAL" || cadence === "RESEARCH" || cadence === "COLLECTIVE";

  if (!countsForCI) return 0;

  let score = 70;

  if (String(row.target ?? "").trim()) score += 14;
  if (equipment.length > 0) score += 10;
  if (notes.length >= 120) score += 18;
  else if (notes.length >= 40) score += 10;

  if (media.length >= 1) score += 20;
  if (media.length >= 2) score += 8;
  if (tags.length >= 2) score += 10;

  if (status === "verified") score = Math.round(score * 1.35);
  if (status === "review") score = Math.round(score * 1.1);
  if (status === "flagged") score = Math.round(score * 0.7);

  if (cadence === "RESEARCH" || cadence === "COLLECTIVE") {
    score = Math.round(score * 2.0);
  }

  return Math.max(0, score);
}

function formatRank(value: number) {
  return `#${value.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rankUsers(
  rows: UserScoreRow[],
  metric: "oi" | "ci"
): Array<UserScoreRow & { rank: number }> {
  return [...rows]
    .sort((a, b) => {
      const primary = b[metric] - a[metric];
      if (primary !== 0) return primary;

      const secondary = b.verifiedCount - a.verifiedCount;
      if (secondary !== 0) return secondary;

      const tertiary = b.observations - a.observations;
      if (tertiary !== 0) return tertiary;

      return (b.latestAt ?? "").localeCompare(a.latestAt ?? "");
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export default function Leaderboard() {
  const device = useDeviceProfile("leaderboard");
  const [tab, setTab] = useState<LeaderboardTab>("oi");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<UserScoreRow[]>([]);

  useEffect(() => {
    let active = true;

    async function loadLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!active) return;
        setSessionUserId(authData.session?.user.id ?? null);

        const [{ data: profiles, error: profileError }, { data: observations, error: observationError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id,callsign,role,city,country,avatar_url,observation_index,campaign_impact,is_pro"),
            supabase.from("observations").select("*").order("created_at", { ascending: false }).limit(3000),
          ]);

        if (profileError) throw profileError;
        if (observationError) throw observationError;

        let campaignsById = new Map<string, CampaignRow>();
        try {
          const { data: campaigns } = await supabase
            .from("campaigns")
            .select("id,title,cadence,tags,is_active");
          campaignsById = new Map(
            ((campaigns as CampaignRow[] | null) ?? []).map((campaign) => [campaign.id, campaign])
          );
        } catch {
          campaignsById = new Map();
        }

        const profileMap = new Map<string, ProfileRow>();
        ((profiles as ProfileRow[] | null) ?? []).forEach((profile) => {
          profileMap.set(profile.id, profile);
        });

        const aggregates = new Map<string, UserScoreRow>();

        ((observations as ObservationRow[] | null) ?? []).forEach((row) => {
          if (!row?.id || !row?.user_id) return;

          const profile = profileMap.get(row.user_id) ?? null;
          const media = normalizeMedia(row);
          const status = normalizeStatus(row);
          const oi = getObservationOI(row, campaignsById);
          const ci = getObservationCI(row, campaignsById);
          const cadence = getCadenceFromCampaign(row, campaignsById);

          const current = aggregates.get(row.user_id) ?? {
            userId: row.user_id,
            callsign: profile?.callsign?.trim() || "Array Operator",
            role: profile?.role ?? null,
            location: buildLocation(profile),
            avatarUrl: profile?.avatar_url ?? null,
            isPro: Boolean(profile?.is_pro),
            oi: 0,
            ci: 0,
            observations: 0,
            verifiedCount: 0,
            campaignCount: 0,
            latestAt: null,
            sourceObservationCount: 0,
            sourceMediaCount: 0,
          };

          current.oi += oi;
          current.ci += ci;
          current.observations += 1;
          current.sourceObservationCount += 1;
          current.sourceMediaCount += media.length;

          if (status === "verified") current.verifiedCount += 1;
          if (ci > 0 || cadence === "DAILY" || cadence === "WEEKLY") current.campaignCount += 1;

          const observedAt = String(row.observing_at ?? row.created_at ?? "");
          if (!current.latestAt || observedAt > current.latestAt) {
            current.latestAt = observedAt;
          }

          aggregates.set(row.user_id, current);
        });

        profileMap.forEach((profile) => {
          if (aggregates.has(profile.id)) return;

          aggregates.set(profile.id, {
            userId: profile.id,
            callsign: profile.callsign?.trim() || "Array Operator",
            role: profile.role ?? null,
            location: buildLocation(profile),
            avatarUrl: profile.avatar_url ?? null,
            isPro: Boolean(profile.is_pro),
            oi: Number(profile.observation_index ?? 0),
            ci: Number(profile.campaign_impact ?? 0),
            observations: 0,
            verifiedCount: 0,
            campaignCount: 0,
            latestAt: null,
            sourceObservationCount: 0,
            sourceMediaCount: 0,
          });
        });

        if (!active) return;
        setRows(Array.from(aggregates.values()));
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load leaderboard.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadLeaderboard();

    const observationChannel = supabase
      .channel("leaderboard-observations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observations" },
        () => loadLeaderboard()
      )
      .subscribe();

    const profileChannel = supabase
      .channel("leaderboard-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => loadLeaderboard()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(observationChannel);
      supabase.removeChannel(profileChannel);
    };
  }, []);

  const oiRanked = useMemo(() => rankUsers(rows, "oi"), [rows]);
  const ciRanked = useMemo(() => rankUsers(rows, "ci"), [rows]);

  const activeRows = tab === "ci" ? ciRanked : oiRanked;

  const totals = useMemo(() => {
    return {
      operators: rows.length,
      observations: rows.reduce((sum, row) => sum + row.observations, 0),
      totalOI: rows.reduce((sum, row) => sum + row.oi, 0),
      totalCI: rows.reduce((sum, row) => sum + row.ci, 0),
      proOperators: rows.filter((row) => row.isPro).length,
    };
  }, [rows]);

  const myOiRank = oiRanked.find((row) => row.userId === sessionUserId)?.rank ?? null;
  const myCiRank = ciRanked.find((row) => row.userId === sessionUserId)?.rank ?? null;

  return (
    <div className={`pageStack device-${device.deviceClass}`}>
      <section className="heroPanel leaderboardHero">
        <div className="leaderboardHeroTop">
          <div>
            <div className="eyebrow">COMMUNITY RANKING</div>
            <h1 className="pageTitle">Operator standings with real scoring.</h1>
            <p className="pageText leaderboardIntro">
              Observation Index rewards complete, evidence-backed submissions. Campaign Impact only
              counts global and research collective work. Daily and weekly campaigns boost OI, while
              Research Collective campaign submissions apply a 2.0× CI multiplier.
            </p>
          </div>

          <div className="leaderboardTabs">
            <button
              type="button"
              className={`tabBtn ${tab === "oi" ? "active" : ""}`}
              onClick={() => setTab("oi")}
            >
              OI
            </button>
            <button
              type="button"
              className={`tabBtn ${tab === "ci" ? "active" : ""}`}
              onClick={() => setTab("ci")}
            >
              CI
            </button>
            <button
              type="button"
              className={`tabBtn ${tab === "ranks" ? "active" : ""}`}
              onClick={() => setTab("ranks")}
            >
              How ranks work
            </button>
          </div>
        </div>

        <div className="gridFour compactStats">
          <div className="metricCard">
            <div className="metricLabel">Operators ranked</div>
            <div className="metricValue">{totals.operators.toLocaleString()}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Scored observations</div>
            <div className="metricValue">{totals.observations.toLocaleString()}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Your OI rank</div>
            <div className="metricValue">{myOiRank ? formatRank(myOiRank) : "—"}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Solar gold</div>
            <div className="metricValue">{totals.proOperators.toLocaleString()}</div>
          </div>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      {loading ? (
        <section className="panel">
          <div className="stateTitle">Loading leaderboard…</div>
          <div className="stateText">
            Pulling operators, observations, and campaign signals from Supabase.
          </div>
        </section>
      ) : tab === "ranks" ? (
        <div className="gridTwo">
          <section className="panel">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">SCORING SYSTEM</div>
                <h2 className="sectionTitle">Observation Index (OI)</h2>
              </div>
            </div>

            <div className="ruleList">
              <div className="ruleCard">
                <strong>Base submission score</strong>
                <span>Each observation starts with a base score, then gains points for completeness.</span>
              </div>
              <div className="ruleCard">
                <strong>Input quality matters</strong>
                <span>Target, observing time, equipment, notes, tags, and attached media all add to OI.</span>
              </div>
              <div className="ruleCard">
                <strong>Mode-aware scoring</strong>
                <span>Visual and radio both score, with strong credit for evidence-backed uploads.</span>
              </div>
              <div className="ruleCard">
                <strong>Verification changes weight</strong>
                <span>Verified submissions score higher. Flagged submissions are reduced.</span>
              </div>
              <div className="ruleCard">
                <strong>Campaign multipliers</strong>
                <span>Daily campaign submissions apply a 1.3× OI multiplier. Weekly campaign submissions apply a 1.5× multiplier.</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">CAMPAIGN IMPACT</div>
                <h2 className="sectionTitle">Campaign Impact (CI)</h2>
              </div>
            </div>

            <div className="ruleList">
              <div className="ruleCard">
                <strong>Only campaign-scale work counts</strong>
                <span>CI is only earned from global and research collective campaign submissions.</span>
              </div>
              <div className="ruleCard">
                <strong>Research work is weighted higher</strong>
                <span>Collective and research campaign observations apply a 2.0× CI multiplier.</span>
              </div>
              <div className="ruleCard">
                <strong>Evidence increases impact</strong>
                <span>Media, support files, tags, and detailed notes raise campaign value.</span>
              </div>
              <div className="ruleCard">
                <strong>Verification still matters</strong>
                <span>Verified campaign work receives the strongest CI multiplier.</span>
              </div>
            </div>
          </section>

          <section className="panel rulesWide">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">RANK ORDER</div>
                <h2 className="sectionTitle">How the leaderboard is sorted</h2>
              </div>
            </div>

            <div className="explainGrid">
              <div className="featureCard">
                <strong>Primary sort</strong>
                <span>The selected score, either OI or CI, is always ranked highest first.</span>
              </div>
              <div className="featureCard">
                <strong>Tie-breaker one</strong>
                <span>Operators with more verified observations rank above operators with fewer verified observations.</span>
              </div>
              <div className="featureCard">
                <strong>Tie-breaker two</strong>
                <span>Total observation count breaks remaining ties.</span>
              </div>
              <div className="featureCard">
                <strong>Tie-breaker three</strong>
                <span>More recent activity ranks ahead when scores and counts are equal.</span>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <>
          <section className="panel">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">FULL LADDER</div>
                <h2 className="sectionTitle">
                  {tab === "oi" ? "All operators by OI" : "All operators by CI"}
                </h2>
              </div>
            </div>

            {activeRows.length === 0 ? (
              <div className="emptyState">
                No ranked operators yet. Once observations are submitted, operators will appear here.
              </div>
            ) : (
              <div className="ladderList">
                {activeRows.map((row) => {
                  const isSelf = row.userId === sessionUserId;
                  const score = tab === "oi" ? row.oi : row.ci;

                  return (
                    <div
                      key={`${tab}-row-${row.userId}`}
                      className={`ladderRow ${isSelf ? "isSelf" : ""} ${row.isPro ? "isPro" : ""}`}
                    >
                      <div className="ladderRank">{row.rank}</div>

                      <div className="ladderIdentity">
                        {row.avatarUrl ? (
                          <img className={`ladderAvatar ${row.isPro ? "goldAvatarRing" : ""}`} src={row.avatarUrl} alt={row.callsign} />
                        ) : (
                          <div className={`ladderAvatar fallback ${row.isPro ? "goldAvatarRing goldFallbackAvatar" : ""}`}>
                            {row.callsign.slice(0, 1).toUpperCase()}
                          </div>
                        )}

                        <div className="ladderIdentityText">
                          <div className="rankNameRow">
                            <div className={`ladderName ${isSelf ? "selfName" : ""} ${row.isPro ? "solarGoldText" : ""}`}>
                              {row.callsign}
                            </div>
                            {row.isPro ? <span className="solarGoldChip compact">PRO</span> : null}
                          </div>
                          <div className="ladderSub">
                            {[row.role, row.location].filter(Boolean).join(" • ") || "Network Operator"}
                          </div>
                        </div>
                      </div>

                      <div className="ladderMetric">
                        <span>{tab === "oi" ? "OI" : "CI"}</span>
                        <strong>{score.toLocaleString()}</strong>
                      </div>

                      <div className="ladderMetric">
                        <span>Obs</span>
                        <strong>{row.observations.toLocaleString()}</strong>
                      </div>

                      <div className="ladderMetric">
                        <span>Verified</span>
                        <strong>{row.verifiedCount.toLocaleString()}</strong>
                      </div>

                      <div className="ladderMetric">
                        <span>Last active</span>
                        <strong>{formatDate(row.latestAt)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <style>{`
        .leaderboardHero{
          display:grid;
          gap: 20px;
        }

        .leaderboardHeroTop{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap: 18px;
        }

        .leaderboardIntro{
          max-width: 860px;
        }

        .leaderboardTabs{
          display:grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          min-width: 320px;
        }

        .topSixGrid{
          display:grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .topRankCard{
          padding: 18px;
          border-radius: 22px;
          border: 1px solid rgba(92,214,255,0.12);
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.06), transparent 35%),
            linear-gradient(180deg, rgba(12,20,38,0.92), rgba(8,14,28,0.92));
          display:grid;
          gap: 16px;
          min-height: 220px;
        }

        .topRankCard.rank-1{
          border-color: rgba(246,196,83,0.30);
          box-shadow: 0 24px 60px rgba(246,196,83,0.08);
        }

        .topRankCard.rank-2{
          border-color: rgba(180,196,220,0.26);
        }

        .topRankCard.rank-3{
          border-color: rgba(174,109,69,0.28);
        }

        .topRankCard.isSelf{
          border-color: rgba(124,58,237,0.42);
          box-shadow: 0 24px 70px rgba(124,58,237,0.14);
        }

        .topRankCard.isPro{
          border-color: rgba(242,191,87,0.22);
          box-shadow: 0 22px 56px rgba(242,191,87,0.08);
        }

        .topRankCard.isSelf.isPro{
          box-shadow: 0 24px 70px rgba(124,58,237,0.14), 0 0 0 1px rgba(242,191,87,0.08);
        }

        .topRankTop{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap: 12px;
        }

        .topRankNumber{
          font-size: 44px;
          font-weight: 900;
          line-height: 0.95;
        }

        .topRankBadge{
          white-space:nowrap;
        }

        .topRankIdentity{
          display:flex;
          gap: 12px;
          align-items:center;
        }

        .topRankAvatar,
        .ladderAvatar{
          width: 52px;
          height: 52px;
          object-fit:cover;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          flex-shrink:0;
        }

        .ladderAvatar{
          width: 42px;
          height: 42px;
        }

        .topRankAvatar.fallback,
        .ladderAvatar.fallback{
          display:grid;
          place-items:center;
          font-weight:900;
          color: var(--cyan);
        }

        .topRankName,
        .ladderName{
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .solarGoldText{
          color: #f2bf57;
          text-shadow: 0 0 18px rgba(242,191,87,0.18);
        }

        .solarGoldChip{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(242,191,87,0.24);
          background:rgba(242,191,87,0.08);
          color:#ffe4a5;
          font-weight:800;
          font-size:11px;
          letter-spacing:0.08em;
          white-space:nowrap;
        }

        .solarGoldChip.compact{
          padding:4px 8px;
          font-size:10px;
        }

        .rankNameRow{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .goldAvatarRing{
          border-color: rgba(242,191,87,0.32);
          box-shadow: 0 0 22px rgba(242,191,87,0.12);
        }

        .goldFallbackAvatar{
          color: #f2bf57;
          background: rgba(242,191,87,0.08);
        }

        .selfName{
          color: #a78bfa;
        }

        .topRankSub,
        .ladderSub{
          margin-top: 4px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.4;
        }

        .topRankStats{
          display:grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .miniStat,
        .ladderMetric{
          padding: 12px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          display:grid;
          gap: 6px;
        }

        .miniStat span,
        .ladderMetric span{
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .miniStat strong,
        .ladderMetric strong{
          font-size: 16px;
        }

        .ladderList{
          display:grid;
          gap: 10px;
        }

        .ladderRow{
          display:grid;
          grid-template-columns: 88px minmax(240px, 1.6fr) repeat(4, minmax(110px, 0.7fr));
          gap: 12px;
          align-items:center;
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .ladderRow.isSelf{
          border-color: rgba(124,58,237,0.32);
          background: linear-gradient(90deg, rgba(124,58,237,0.10), rgba(255,255,255,0.03));
        }

        .ladderRow.isPro{
          border-color: rgba(242,191,87,0.18);
          background: linear-gradient(90deg, rgba(242,191,87,0.06), rgba(255,255,255,0.03));
        }

        .ladderRow.isSelf.isPro{
          background: linear-gradient(90deg, rgba(124,58,237,0.10), rgba(242,191,87,0.05), rgba(255,255,255,0.03));
        }

        .ladderRank{
          font-size: 28px;
          font-weight: 900;
          color: rgba(255,255,255,0.94);
        }

        .ladderIdentity{
          display:flex;
          gap: 12px;
          align-items:center;
          min-width:0;
        }

        .ladderIdentityText{
          min-width:0;
        }

        .ruleList{
          display:grid;
          gap: 12px;
        }

        .ruleCard{
          padding: 16px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          display:grid;
          gap: 8px;
        }

        .ruleCard span{
          color: var(--muted);
          line-height:1.6;
        }

        .rulesWide{
          grid-column: 1 / -1;
        }

        .explainGrid{
          display:grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        @media (max-width: 1120px){
          .topSixGrid{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ladderRow{
            grid-template-columns: 72px minmax(220px, 1.5fr) repeat(2, minmax(110px, 0.8fr));
          }

          .ladderRow .ladderMetric:nth-of-type(3),
          .ladderRow .ladderMetric:nth-of-type(4){
            display:none;
          }
        }

        @media (max-width: 860px){
          .leaderboardHeroTop{
            display:grid;
            grid-template-columns: 1fr;
          }

          .leaderboardTabs{
            min-width: 0;
          }

          .topSixGrid,
          .explainGrid{
            grid-template-columns: 1fr;
          }

          .ladderRow{
            grid-template-columns: 64px 1fr;
          }

          .ladderMetric{
            grid-column: span 1;
          }
        }

        @media (max-width: 640px){
          .topRankStats{
            grid-template-columns: 1fr;
          }

          .ladderRow{
            grid-template-columns: 1fr;
          }

          .ladderRank{
            font-size: 22px;
          }

          .ladderIdentity{
            order: -1;
          }
        }
      `}</style>
    </div>
  );
}
