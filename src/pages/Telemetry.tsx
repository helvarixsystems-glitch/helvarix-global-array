import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useDeviceProfile } from "../hooks/useDeviceProfile";

type ObservationRecord = {
  id: string;
  user_id: string;
  created_at: string;
  campaign_id?: string | null;
  mode?: string | null;
  target?: string | null;
  tags?: string[] | null;
  image_url?: string | null;
  notes?: string | null;
  description?: string | null;
  equipment?: string | null;
  verification_status?: string | null;
  status?: string | null;
  observing_at?: string | null;
  files?: unknown;
  file_urls?: unknown;
  image_urls?: unknown;
  media_urls?: unknown;
  uploads?: unknown;
  attachments?: unknown;
  [key: string]: unknown;
};

type CampaignRecord = {
  id: string;
  title?: string | null;
  cadence?: string | null;
  tags?: string[] | null;
  access_tier?: string | null;
  campaign_class?: string | null;
};

type ProfileRecord = {
  id: string;
  callsign: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  avatar_url?: string | null;
  is_pro?: boolean | null;
};

type ObservationLikeRecord = {
  observation_id: string;
  user_id: string;
};

type ObservationCommentRecord = {
  id: string;
  observation_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type FeedComment = {
  id: string;
  observationId: string;
  userId: string;
  body: string;
  createdAt: string;
  callsign: string;
  avatarUrl: string | null;
  isPro: boolean;
};

type FeedItem = {
  id: string;
  userId: string;
  createdAt: string;
  observedAt: string | null;
  mode: string;
  target: string;
  tags: string[];
  equipment: string | null;
  notes: string | null;
  status: string;
  media: string[];
  callsign: string;
  role: string | null;
  location: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  isResearch: boolean;
  campaignLabel: string | null;
  raw: ObservationRecord;
};

type FeedFilter = "all" | "media" | "research" | "mine";

const SOLAR_GOLD = "#f2bf57";

function toTitleCase(value: string) {
  return value
    .replace(/[\-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

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
    const nestedCandidates = [
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
    ];

    return nestedCandidates.flatMap((candidate) => extractStringArray(candidate));
  }

  return [];
}

function normalizeMedia(row: ObservationRecord): string[] {
  const candidates = [
    row.image_url,
    row.image_urls,
    row.media_urls,
    row.file_urls,
    row.files,
    row.uploads,
    row.attachments,
  ];

  const urls = candidates
    .flatMap((candidate) => extractStringArray(candidate))
    .filter((url) => /^https?:\/\//i.test(url));

  return Array.from(new Set(urls));
}

function normalizeStatus(row: ObservationRecord) {
  const raw = String(row.verification_status ?? row.status ?? "pending")
    .trim()
    .toLowerCase();

  if (["verified", "approved", "confirmed"].includes(raw)) return "Verified";
  if (["rejected", "flagged"].includes(raw)) return "Flagged";
  if (["processing", "review", "reviewing", "in review"].includes(raw)) return "In Review";
  return "Pending";
}

function buildLocation(profile: ProfileRecord | null | undefined) {
  if (!profile) return null;
  const parts = [profile.city, profile.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTimeFromNow(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);

  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(days, "day");
}

function getStatusClass(status: string) {
  if (status === "Verified") return "good";
  if (status === "Flagged") return "bad";
  if (status === "In Review") return "warn";
  return "neutral";
}

function isResearchCampaign(campaign: CampaignRecord | null | undefined, row: ObservationRecord) {
  const text = [
    campaign?.campaign_class,
    campaign?.access_tier,
    campaign?.cadence,
    campaign?.title,
    extractStringArray(campaign?.tags).join(" "),
    String(row.campaign_class ?? ""),
    String(row.campaign_scope ?? ""),
    String(row.campaign_type ?? ""),
    String(row.campaign_title ?? ""),
    String(row.campaign_name ?? ""),
    extractStringArray(row.tags).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("research_collective") ||
    text.includes("research collective") ||
    text.includes("collective") ||
    text.includes("research")
  );
}

function campaignLabel(campaign: CampaignRecord | null | undefined, isResearch: boolean) {
  if (isResearch) return "Research Collective";
  const cadence = String(campaign?.cadence ?? "").trim().toUpperCase();
  if (cadence === "DAILY") return "Daily";
  if (cadence === "WEEKLY") return "Weekly";
  if (cadence === "GLOBAL") return "Global";
  return null;
}

async function loadProfiles(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, ProfileRecord>();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,callsign,role,city,country,avatar_url,is_pro")
    .in("id", userIds);

  if (error) throw error;

  const map = new Map<string, ProfileRecord>();
  ((data as ProfileRecord[] | null) ?? []).forEach((profile) => {
    map.set(profile.id, profile);
  });

  return map;
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

export default function Telemetry() {
  const device = useDeviceProfile("telemetry");
  const isMobile = device.deviceClass === "mobile";

  const [items, setItems] = useState<FeedItem[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [likesEnabled, setLikesEnabled] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [commentsByObservation, setCommentsByObservation] = useState<Record<string, FeedComment[]>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [interactionBusy, setInteractionBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadFeed() {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = await supabase.auth.getSession();
        const userId = authData.session?.user.id ?? null;
        if (active) setSessionUserId(userId);

        const [{ data, error: feedError }, { data: campaignsData, error: campaignsError }] = await Promise.all([
          supabase.from("observations").select("*").order("created_at", { ascending: false }).limit(60),
          supabase.from("campaigns").select("id,title,cadence,tags,access_tier,campaign_class"),
        ]);

        if (feedError) throw feedError;
        if (campaignsError) throw campaignsError;

        const campaignMap = new Map<string, CampaignRecord>();
        ((campaignsData as CampaignRecord[] | null) ?? []).forEach((campaign) => {
          campaignMap.set(campaign.id, campaign);
        });

        const rows = ((data as ObservationRecord[] | null) ?? []).filter(
          (row) => row?.id && row?.user_id
        );

        const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
        const profiles = await loadProfiles(userIds);

        const mapped: FeedItem[] = rows.map((row) => {
          const profile = profiles.get(row.user_id) ?? null;
          const tags = extractStringArray(row.tags);
          const notes =
            typeof row.notes === "string"
              ? row.notes
              : typeof row.description === "string"
                ? row.description
                : null;
          const campaign = row.campaign_id ? campaignMap.get(row.campaign_id) ?? null : null;
          const research = isResearchCampaign(campaign, row);

          return {
            id: row.id,
            userId: row.user_id,
            createdAt: row.created_at,
            observedAt: typeof row.observing_at === "string" ? row.observing_at : null,
            mode: toTitleCase(String(row.mode ?? "Observation")),
            target: String(row.target ?? "Untitled Observation").trim() || "Untitled Observation",
            tags,
            equipment: typeof row.equipment === "string" ? row.equipment : null,
            notes,
            status: normalizeStatus(row),
            media: normalizeMedia(row),
            callsign: profile?.callsign?.trim() || "Array Operator",
            role: profile?.role ?? null,
            location: buildLocation(profile),
            avatarUrl: profile?.avatar_url ?? null,
            isPro: Boolean(profile?.is_pro),
            isResearch: research,
            campaignLabel: campaignLabel(campaign, research),
            raw: row,
          };
        });

        const observationIds = mapped.map((item) => item.id);
        const [likesResult, commentsResult] = await Promise.all([
          loadLikes(observationIds, userId),
          loadComments(observationIds),
        ]);

        if (!active) return;
        setItems(mapped);
        setLikeCounts(likesResult.likeCounts);
        setLikedByMe(likesResult.likedByMe);
        setLikesEnabled(likesResult.enabled);
        setCommentsByObservation(commentsResult.commentsByObservation);
        setCommentCounts(commentsResult.commentCounts);
        setCommentsEnabled(commentsResult.enabled);
      } catch (err) {
        console.error("Failed to load telemetry feed:", err);
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load telemetry feed.");
          setItems([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    async function loadLikes(observationIds: string[], userId: string | null) {
      if (!observationIds.length) {
        return {
          enabled: true,
          likeCounts: {},
          likedByMe: {},
        };
      }

      try {
        const { data, error } = await supabase
          .from("observation_likes")
          .select("observation_id,user_id")
          .in("observation_id", observationIds);

        if (error) throw error;

        const counts: Record<string, number> = {};
        const mine: Record<string, boolean> = {};
        ((data as ObservationLikeRecord[] | null) ?? []).forEach((row) => {
          counts[row.observation_id] = (counts[row.observation_id] ?? 0) + 1;
          if (userId && row.user_id === userId) mine[row.observation_id] = true;
        });

        return { enabled: true, likeCounts: counts, likedByMe: mine };
      } catch (err: any) {
        if (looksLikeMissingRelation(err)) {
          return { enabled: false, likeCounts: {}, likedByMe: {} };
        }
        throw err;
      }
    }

    async function loadComments(observationIds: string[]) {
      if (!observationIds.length) {
        return {
          enabled: true,
          commentsByObservation: {},
          commentCounts: {},
        };
      }

      try {
        const { data, error } = await supabase
          .from("observation_comments")
          .select("id,observation_id,user_id,body,created_at")
          .in("observation_id", observationIds)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const rows = (data as ObservationCommentRecord[] | null) ?? [];
        const commenterIds = Array.from(new Set(rows.map((row) => row.user_id)));
        const commenterProfiles = await loadProfiles(commenterIds);

        const byObservation: Record<string, FeedComment[]> = {};
        const counts: Record<string, number> = {};

        rows.forEach((row) => {
          const profile = commenterProfiles.get(row.user_id) ?? null;
          if (!byObservation[row.observation_id]) byObservation[row.observation_id] = [];
          byObservation[row.observation_id].push({
            id: row.id,
            observationId: row.observation_id,
            userId: row.user_id,
            body: row.body,
            createdAt: row.created_at,
            callsign: profile?.callsign?.trim() || "Array Operator",
            avatarUrl: profile?.avatar_url ?? null,
            isPro: Boolean(profile?.is_pro),
          });
          counts[row.observation_id] = (counts[row.observation_id] ?? 0) + 1;
        });

        return {
          enabled: true,
          commentsByObservation: byObservation,
          commentCounts: counts,
        };
      } catch (err: any) {
        if (looksLikeMissingRelation(err)) {
          return {
            enabled: false,
            commentsByObservation: {},
            commentCounts: {},
          };
        }
        throw err;
      }
    }

    loadFeed();

    const observationChannel = supabase
      .channel("telemetry-feed-observations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observations" },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    const profileChannel = supabase
      .channel("telemetry-feed-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    const likeChannel = supabase
      .channel("telemetry-feed-likes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observation_likes" },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    const commentChannel = supabase
      .channel("telemetry-feed-comments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observation_comments" },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(observationChannel);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(likeChannel);
      supabase.removeChannel(commentChannel);
    };
  }, []);

  async function handleToggleLike(item: FeedItem) {
    if (!sessionUserId) {
      setError("You must be signed in to like observations.");
      return;
    }
    if (!likesEnabled) {
      setError("The observation_likes table is not available yet. Run the SQL first.");
      return;
    }

    setInteractionBusy(`like-${item.id}`);
    setError(null);

    try {
      if (likedByMe[item.id]) {
        const { error } = await supabase
          .from("observation_likes")
          .delete()
          .eq("observation_id", item.id)
          .eq("user_id", sessionUserId);
        if (error) throw error;

        setLikedByMe((current) => ({ ...current, [item.id]: false }));
        setLikeCounts((current) => ({
          ...current,
          [item.id]: Math.max(0, (current[item.id] ?? 0) - 1),
        }));
      } else {
        const { error } = await supabase.from("observation_likes").insert({
          observation_id: item.id,
          user_id: sessionUserId,
        });
        if (error) throw error;

        setLikedByMe((current) => ({ ...current, [item.id]: true }));
        setLikeCounts((current) => ({
          ...current,
          [item.id]: (current[item.id] ?? 0) + 1,
        }));
      }
    } catch (err: any) {
      setError(err?.message ?? "Unable to update like.");
    } finally {
      setInteractionBusy(null);
    }
  }

  async function handleAddComment(item: FeedItem) {
    if (!sessionUserId) {
      setError("You must be signed in to comment.");
      return;
    }
    if (!commentsEnabled) {
      setError("The observation_comments table is not available yet. Run the SQL first.");
      return;
    }

    const body = String(commentDrafts[item.id] ?? "").trim();
    if (!body) {
      setError("Write a comment before posting.");
      return;
    }

    setInteractionBusy(`comment-${item.id}`);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("observation_comments")
        .insert({
          observation_id: item.id,
          user_id: sessionUserId,
          body,
        })
        .select("id,observation_id,user_id,body,created_at")
        .single();

      if (error) throw error;

      const newComment = data as ObservationCommentRecord;
      const commenter = items.find((entry) => entry.userId === sessionUserId);
      const mapped: FeedComment = {
        id: newComment.id,
        observationId: newComment.observation_id,
        userId: newComment.user_id,
        body: newComment.body,
        createdAt: newComment.created_at,
        callsign: commenter?.callsign ?? "Array Operator",
        avatarUrl: commenter?.avatarUrl ?? null,
        isPro: Boolean(commenter?.isPro),
      };

      setCommentDrafts((current) => ({ ...current, [item.id]: "" }));
      setExpandedComments((current) => ({ ...current, [item.id]: true }));
      setCommentsByObservation((current) => ({
        ...current,
        [item.id]: [...(current[item.id] ?? []), mapped],
      }));
      setCommentCounts((current) => ({
        ...current,
        [item.id]: (current[item.id] ?? 0) + 1,
      }));
    } catch (err: any) {
      setError(err?.message ?? "Unable to post comment.");
    } finally {
      setInteractionBusy(null);
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (filter === "media" && item.media.length === 0) return false;
      if (filter === "research" && !item.isResearch) return false;
      if (filter === "mine" && item.userId !== sessionUserId) return false;

      if (!query) return true;

      const haystack = [
        item.target,
        item.callsign,
        item.mode,
        item.location,
        item.role,
        item.notes,
        item.equipment,
        item.tags.join(" "),
        item.campaignLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [filter, items, search, sessionUserId]);

  const stats = useMemo(() => {
    const withMedia = items.filter((item) => item.media.length > 0).length;
    const verified = items.filter((item) => item.status === "Verified").length;
    const mine = items.filter((item) => item.userId === sessionUserId).length;
    const proPosts = items.filter((item) => item.isPro).length;
    const research = items.filter((item) => item.isResearch).length;

    return {
      total: items.length,
      withMedia,
      verified,
      mine,
      proPosts,
      research,
    };
  }, [items, sessionUserId]);

  return (
    <div className={`pageStack device-${device.deviceClass}`}>
      <section className="heroPanel telemetryHero">
        <div className="telemetryHeroTop">
          <div>
            <div className="eyebrow">COMMUNITY FEED</div>
            <h1 className="pageTitle">Live telemetry from the network.</h1>
            {!isMobile ? (
              <p className="telemetryIntro">
                Public uploads, Research Collective submissions, and community interaction now live in
                one feed layer with likes and threaded comments.
              </p>
            ) : null}
          </div>

          <Link className="primaryBtn compactAction" to="/submit">
            New Submission
          </Link>
        </div>

        <div className="telemetryControls">
          <div className="inputShell telemetrySearch">
            <span className="inputIcon">⌕</span>
            <input
              className="input telemetryInput"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search target, callsign, equipment, tags…"
            />
          </div>

          <div className="telemetryFilters">
            <button
              type="button"
              className={`tabBtn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>

            <button
              type="button"
              className={`tabBtn ${filter === "research" ? "active" : ""}`}
              onClick={() => setFilter("research")}
            >
              Research Collective
            </button>

            <button
              type="button"
              className={`tabBtn ${filter === "media" ? "active" : ""}`}
              onClick={() => setFilter("media")}
            >
              Media First
            </button>

            <button
              type="button"
              className={`tabBtn ${filter === "mine" ? "active" : ""}`}
              onClick={() => setFilter("mine")}
            >
              Mine
            </button>
          </div>
        </div>

        <div className="gridFour telemetryStats">
          <div className="metricCard telemetryMetricCard compactMetricCard">
            <div className="metricLabel">Feed items</div>
            <div className="metricValue">{stats.total}</div>
          </div>

          <div className="metricCard telemetryMetricCard compactMetricCard">
            <div className="metricLabel">Research posts</div>
            <div className="metricValue">{stats.research}</div>
          </div>

          <div className="metricCard telemetryMetricCard compactMetricCard">
            <div className="metricLabel">Verified</div>
            <div className="metricValue">{stats.verified}</div>
          </div>

          <div className="metricCard telemetryMetricCard compactMetricCard">
            <div className="metricLabel">Solar gold</div>
            <div className="metricValue">{stats.proPosts}</div>
          </div>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      {loading ? (
        <section className="panel">
          <div className="stateTitle">Loading live observations…</div>
          <div className="stateText">
            Pulling network submissions, campaign context, likes, and comments from Supabase.
          </div>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="panel emptyTelemetryState">
          <div className="sectionKicker">NO OBSERVATIONS YET</div>
          {!isMobile ? <h2 className="sectionTitle">Your feed is ready for real data.</h2> : null}
        </section>
      ) : (
        <div className="telemetryFeedGrid">
          {filteredItems.map((item) => {
            const primaryMedia = item.media[0] ?? null;
            const timestamp = item.observedAt ?? item.createdAt;
            const isOwnPost = item.userId === sessionUserId;
            const comments = commentsByObservation[item.id] ?? [];
            const commentsOpen = Boolean(expandedComments[item.id]);
            const likes = likeCounts[item.id] ?? 0;
            const commentCount = commentCounts[item.id] ?? comments.length;

            return (
              <article
                key={item.id}
                className={`panel feedCard ${primaryMedia ? "withMedia" : "noMedia"} ${
                  item.isPro ? "proFeedCard" : ""
                } ${item.isResearch ? "researchFeedCard" : ""}`}
              >
                <div className="feedCardTop">
                  <div className="feedIdentity">
                    {item.avatarUrl ? (
                      <img className="feedAvatar" src={item.avatarUrl} alt={item.callsign} />
                    ) : (
                      <div className={`feedAvatar fallback ${item.isPro ? "solarGoldAvatar" : ""}`}>
                        {item.callsign.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <div className="feedCallsignRow">
                        <span className={`feedCallsign ${item.isPro ? "solarGoldText" : ""}`}>
                          {item.callsign}
                        </span>
                        {item.isPro ? <span className="solarGoldChip">PRO</span> : null}
                        {item.isResearch ? <span className="researchChip">COLLECTIVE</span> : null}
                        {isOwnPost ? <span className="statusPill tiny">You</span> : null}
                      </div>

                      <div className="feedMetaLine">
                        {[item.role, item.location].filter(Boolean).join(" • ") || "Network Operator"}
                      </div>
                    </div>
                  </div>

                  <div className="feedStatusStack">
                    {item.campaignLabel ? <span className="statusPill subtle">{item.campaignLabel}</span> : null}
                    <span className={`statusBadge ${getStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                <div className="feedMediaWrap">
                  {primaryMedia ? (
                    <img
                      className="feedMedia"
                      src={primaryMedia}
                      alt={`${item.target} observation`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="feedMediaPlaceholder">
                      <div className="placeholderMode">{item.mode}</div>
                      <div className="placeholderTarget">{item.target}</div>
                      <div className="placeholderSub">No media attached yet</div>
                    </div>
                  )}
                </div>

                <div className="feedContent">
                  <div className="feedHeadline">
                    <div>
                      <div className="sectionKicker">{item.mode}</div>
                      <h2 className="feedTarget">{item.target}</h2>
                    </div>

                    <div className="feedTimeBlock">
                      <div>{relativeTimeFromNow(timestamp)}</div>
                      <span>{formatTimestamp(timestamp)}</span>
                    </div>
                  </div>

                  {item.notes ? <p className="feedNotes">{item.notes}</p> : null}

                  <div className="feedDetailsGrid">
                    <div className="feedDetailCard">
                      <span>Captured</span>
                      <strong>{formatTimestamp(timestamp)}</strong>
                    </div>

                    <div className="feedDetailCard">
                      <span>Media</span>
                      <strong>
                        {item.media.length > 0
                          ? `${item.media.length} file${item.media.length > 1 ? "s" : ""}`
                          : "Pending uploads"}
                      </strong>
                    </div>

                    <div className="feedDetailCard full">
                      <span>Equipment</span>
                      <strong>{item.equipment ?? "No equipment details submitted yet."}</strong>
                    </div>
                  </div>

                  {item.tags.length > 0 ? (
                    <div className="feedTags">
                      {item.tags.map((tag) => (
                        <span key={`${item.id}-${tag}`} className="feedTag">
                          #{tag.replace(/^#/, "")}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="feedActionsRow">
                    <button
                      type="button"
                      className={`socialBtn ${likedByMe[item.id] ? "activeLike" : ""}`}
                      onClick={() => handleToggleLike(item)}
                      disabled={interactionBusy === `like-${item.id}`}
                    >
                      ♥ {likes}
                    </button>

                    <button
                      type="button"
                      className={`socialBtn ${commentsOpen ? "activeComment" : ""}`}
                      onClick={() =>
                        setExpandedComments((current) => ({
                          ...current,
                          [item.id]: !current[item.id],
                        }))
                      }
                    >
                      💬 {commentCount}
                    </button>
                  </div>

                  {commentsOpen ? (
                    <div className="commentsPanel">
                      <div className="commentComposer">
                        <textarea
                          className="commentInput"
                          placeholder="Add a comment to this observation…"
                          value={commentDrafts[item.id] ?? ""}
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="primaryBtn commentSubmit"
                          onClick={() => handleAddComment(item)}
                          disabled={interactionBusy === `comment-${item.id}`}
                        >
                          Post comment
                        </button>
                      </div>

                      <div className="commentList">
                        {comments.length === 0 ? (
                          <div className="commentEmpty">No comments yet.</div>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="commentCard">
                              {comment.avatarUrl ? (
                                <img className="commentAvatar" src={comment.avatarUrl} alt={comment.callsign} />
                              ) : (
                                <div className={`commentAvatar fallback ${comment.isPro ? "solarGoldAvatar" : ""}`}>
                                  {comment.callsign.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="commentBodyWrap">
                                <div className="commentHead">
                                  <span className={`commentCallsign ${comment.isPro ? "solarGoldText" : ""}`}>
                                    {comment.callsign}
                                  </span>
                                  <span className="commentTime">{relativeTimeFromNow(comment.createdAt)}</span>
                                </div>
                                <div className="commentBody">{comment.body}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style>{`
        .telemetryHero{
          display:grid;
          gap:22px;
          background:
            radial-gradient(circle at top right, rgba(242,191,87,0.08), transparent 30%),
            radial-gradient(circle at top left, rgba(92,214,255,0.10), transparent 34%),
            linear-gradient(180deg, rgba(12,19,36,0.96), rgba(8,13,24,0.96));
        }

        .telemetryHeroTop{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:18px;
        }

        .telemetryIntro{
          margin:12px 0 0;
          color:var(--muted);
          max-width:760px;
          line-height:1.7;
        }

        .compactAction{
          width:auto;
          white-space:nowrap;
        }

        .telemetryControls{
          display:grid;
          grid-template-columns:minmax(0, 1fr) auto;
          gap:14px;
          align-items:center;
        }

        .telemetryFilters{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        }

        .telemetryStats{
          margin-top:4px;
        }

        .telemetryMetricCard{
          min-width:0;
        }

        .inputShell{
          position:relative;
        }

        .inputIcon{
          position:absolute;
          left:16px;
          top:50%;
          transform:translateY(-50%);
          color:var(--muted);
          pointer-events:none;
        }

        .telemetryInput{
          padding-left:42px;
        }

        .emptyTelemetryState{
          padding:30px;
        }

        .telemetryFeedGrid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:18px;
        }

        .feedCard{
          overflow:hidden;
          padding:0;
          transition:transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .feedCard:hover{
          transform:translateY(-2px);
        }

        .proFeedCard{
          border-color:rgba(242,191,87,0.16);
          box-shadow:0 0 0 1px rgba(242,191,87,0.05), 0 16px 40px rgba(0,0,0,0.22);
        }

        .researchFeedCard{
          border-color:rgba(124,58,237,0.24);
          box-shadow:0 0 0 1px rgba(124,58,237,0.06), 0 16px 40px rgba(0,0,0,0.22);
        }

        .feedCardTop,
        .feedContent{
          padding:20px 20px 0;
        }

        .feedCard.noMedia .feedContent{
          padding-top:20px;
        }

        .feedIdentity{
          display:flex;
          align-items:center;
          gap:12px;
          min-width:0;
        }

        .feedCardTop{
          display:flex;
          justify-content:space-between;
          gap:14px;
          align-items:flex-start;
        }

        .feedStatusStack{
          display:grid;
          gap:8px;
          justify-items:end;
        }

        .feedAvatar,
        .commentAvatar{
          width:48px;
          height:48px;
          object-fit:cover;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.05);
          flex-shrink:0;
        }

        .commentAvatar{
          width:38px;
          height:38px;
        }

        .feedAvatar.fallback,
        .commentAvatar.fallback{
          display:grid;
          place-items:center;
          font-weight:800;
          color:var(--cyan);
        }

        .solarGoldAvatar{
          color:${SOLAR_GOLD};
          border-color:rgba(242,191,87,0.32);
          background:rgba(242,191,87,0.08);
          box-shadow:0 0 22px rgba(242,191,87,0.12);
        }

        .feedCallsignRow{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .feedCallsign{
          font-weight:800;
          letter-spacing:0.02em;
        }

        .solarGoldText{
          color:${SOLAR_GOLD};
          text-shadow:0 0 18px rgba(242,191,87,0.18);
        }

        .solarGoldChip,
        .researchChip{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:5px 10px;
          border-radius:999px;
          font-weight:800;
          font-size:11px;
          letter-spacing:0.08em;
        }

        .solarGoldChip{
          border:1px solid rgba(242,191,87,0.26);
          background:rgba(242,191,87,0.10);
          color:#ffe4a5;
        }

        .researchChip{
          border:1px solid rgba(124,58,237,0.28);
          background:rgba(124,58,237,0.12);
          color:#d7c3ff;
        }

        .feedMetaLine{
          margin-top:4px;
          color:var(--muted);
          font-size:13px;
          line-height:1.4;
        }

        .statusPill.tiny{
          padding:4px 8px;
          font-size:11px;
        }

        .statusPill.subtle{
          border-color:rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.04);
          color:var(--text);
        }

        .statusBadge.good{
          color:#93ffd4;
          border-color:rgba(55,211,156,0.28);
          background:rgba(55,211,156,0.12);
        }

        .statusBadge.warn{
          color:#ffd88a;
          border-color:rgba(242,191,87,0.24);
          background:rgba(242,191,87,0.12);
        }

        .statusBadge.bad{
          color:#ff9cb1;
          border-color:rgba(255,111,145,0.24);
          background:rgba(255,111,145,0.12);
        }

        .statusBadge.neutral{
          color:var(--muted);
        }

        .feedMediaWrap{
          margin-top:18px;
          aspect-ratio:4 / 3;
          width:100%;
          border-top:1px solid rgba(255,255,255,0.06);
          border-bottom:1px solid rgba(255,255,255,0.06);
          background:linear-gradient(180deg, rgba(11,18,34,0.95), rgba(7,12,24,0.95));
          overflow:hidden;
        }

        .feedMedia{
          display:block;
          width:100%;
          height:100%;
          object-fit:cover;
        }

        .feedMediaPlaceholder{
          width:100%;
          height:100%;
          display:flex;
          flex-direction:column;
          justify-content:flex-end;
          padding:22px;
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.16), transparent 38%),
            radial-gradient(circle at bottom right, rgba(143,114,255,0.18), transparent 36%),
            linear-gradient(180deg, rgba(14,22,44,0.96), rgba(8,14,28,0.98));
        }

        .placeholderMode{
          font-size:12px;
          letter-spacing:0.24em;
          text-transform:uppercase;
          color:var(--cyan);
        }

        .placeholderTarget{
          margin-top:12px;
          font-size:clamp(22px, 3vw, 32px);
          font-weight:800;
          max-width:70%;
        }

        .placeholderSub{
          margin-top:8px;
          color:var(--muted);
        }

        .feedContent{
          padding-bottom:20px;
        }

        .feedHeadline{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
        }

        .feedTarget{
          margin:8px 0 0;
          font-size:clamp(22px, 2.4vw, 30px);
          line-height:1.05;
        }

        .feedTimeBlock{
          text-align:right;
          font-size:13px;
          color:var(--muted);
          flex-shrink:0;
          line-height:1.4;
        }

        .feedTimeBlock > div{
          color:var(--text);
          font-weight:700;
          margin-bottom:4px;
        }

        .feedNotes{
          margin:14px 0 0;
          color:var(--muted);
          line-height:1.7;
        }

        .feedDetailsGrid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:12px;
          margin-top:18px;
        }

        .feedDetailCard{
          padding:14px;
          border-radius:16px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
          display:grid;
          gap:8px;
        }

        .feedDetailCard span{
          color:var(--muted);
          font-size:12px;
          text-transform:uppercase;
          letter-spacing:0.16em;
        }

        .feedDetailCard strong{
          line-height:1.5;
          font-size:14px;
        }

        .feedDetailCard.full{
          grid-column:1 / -1;
        }

        .feedTags{
          margin-top:16px;
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }

        .feedTag{
          display:inline-flex;
          align-items:center;
          padding:8px 12px;
          border-radius:999px;
          font-size:12px;
          border:1px solid rgba(92,214,255,0.16);
          background:rgba(92,214,255,0.08);
          color:var(--text);
        }

        .feedActionsRow{
          margin-top:18px;
          display:flex;
          gap:12px;
          flex-wrap:wrap;
        }

        .socialBtn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          min-width:92px;
          padding:10px 14px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.04);
          color:var(--text);
          cursor:pointer;
          transition:background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }

        .socialBtn:hover{
          transform:translateY(-1px);
        }

        .socialBtn.activeLike{
          border-color:rgba(242,191,87,0.26);
          background:rgba(242,191,87,0.12);
          color:#ffe4a5;
        }

        .socialBtn.activeComment{
          border-color:rgba(92,214,255,0.22);
          background:rgba(92,214,255,0.10);
        }

        .commentsPanel{
          margin-top:18px;
          padding:16px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,0.06);
          background:rgba(255,255,255,0.03);
          display:grid;
          gap:14px;
        }

        .commentComposer{
          display:grid;
          gap:10px;
        }

        .commentInput{
          width:100%;
          min-height:90px;
          resize:vertical;
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(8,14,28,0.82);
          color:var(--text);
          padding:14px 16px;
          font:inherit;
        }

        .commentSubmit{
          width:auto;
          justify-self:start;
        }

        .commentList{
          display:grid;
          gap:10px;
        }

        .commentEmpty{
          color:var(--muted);
          padding:8px 2px;
        }

        .commentCard{
          display:grid;
          grid-template-columns:auto 1fr;
          gap:12px;
          align-items:flex-start;
          padding:12px;
          border-radius:14px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }

        .commentBodyWrap{
          min-width:0;
        }

        .commentHead{
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        }

        .commentCallsign{
          font-weight:700;
        }

        .commentTime{
          color:var(--muted);
          font-size:12px;
        }

        .commentBody{
          margin-top:6px;
          color:var(--text);
          line-height:1.6;
          white-space:pre-wrap;
          word-break:break-word;
        }

        @media (max-width: 960px){
          .telemetryFeedGrid{
            grid-template-columns:1fr;
          }
        }

        @media (max-width: 820px){
          .telemetryHeroTop,
          .telemetryControls,
          .feedHeadline,
          .feedCardTop{
            grid-template-columns:1fr;
            display:grid;
          }

          .telemetryControls{
            gap:12px;
          }

          .feedTimeBlock,
          .feedStatusStack{
            text-align:left;
            justify-items:start;
          }
        }

        @media (max-width: 640px){
          .telemetryHero{
            gap:14px;
          }

          .telemetryHeroTop{
            gap:12px;
          }

          .telemetryHeroTop .pageTitle{
            margin:0;
            font-size:clamp(24px, 9vw, 34px);
            line-height:1.02;
          }

          .compactAction{
            width:100%;
            padding-top:12px;
            padding-bottom:12px;
          }

          .telemetryControls{
            gap:10px;
          }

          .telemetrySearch .telemetryInput{
            min-height:48px;
          }

          .telemetryFilters{
            gap:8px;
          }

          .telemetryFilters .tabBtn{
            padding:10px 12px;
          }

                  .telemetryStats{
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:8px;
          }

          .compactMetricCard{
            padding:10px 12px;
            min-height:auto;
            height:auto;
            display:grid;
            align-content:start;
            gap:4px;
          }

          .compactMetricCard .metricLabel{
            font-size:12px;
            line-height:1.15;
            margin:0;
          }

          .compactMetricCard .metricValue{
            margin-top:0;
            font-size:22px;
            line-height:1;
          }

                    .telemetryStats .metricCard{
            min-height:auto;
          }

          .feedDetailsGrid{
            grid-template-columns:1fr;
          }

          .placeholderTarget{
            max-width:100%;
          }

          .feedCardTop,
          .feedContent,
          .emptyTelemetryState{
            padding-left:16px;
            padding-right:16px;
          }

          .commentCard{
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </div>
  );
}
