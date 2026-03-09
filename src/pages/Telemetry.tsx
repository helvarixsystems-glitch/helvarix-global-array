import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type ObservationRecord = {
  id: string;
  user_id: string;
  created_at: string;
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

type ProfileRecord = {
  id: string;
  callsign: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  avatar_url?: string | null;
  is_pro?: boolean | null;
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
  raw: ObservationRecord;
};

type FeedFilter = "all" | "media" | "mine";

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

export default function Telemetry() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadFeed() {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = await supabase.auth.getSession();
        const userId = authData.session?.user.id ?? null;
        if (active) setSessionUserId(userId);

        const { data, error: feedError } = await supabase
          .from("observations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(40);

        if (feedError) throw feedError;

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
            raw: row,
          };
        });

        if (active) setItems(mapped);
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

    return () => {
      active = false;
      supabase.removeChannel(observationChannel);
      supabase.removeChannel(profileChannel);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (filter === "media" && item.media.length === 0) return false;
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

    return {
      total: items.length,
      withMedia,
      verified,
      mine,
      proPosts,
    };
  }, [items, sessionUserId]);

  return (
    <div className="pageStack">
      <section className="heroPanel telemetryHero">
        <div className="telemetryHeroTop">
          <div>
            <div className="eyebrow">COMMUNITY FEED</div>
            <h1 className="pageTitle">Live telemetry from the network.</h1>
            <p className="telemetryIntro">
              Real submissions, real operators, and solar-gold subscriber presence throughout the
              public feed.
            </p>
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
          <div className="metricCard">
            <div className="metricLabel">Feed items</div>
            <div className="metricValue">{stats.total}</div>
          </div>

          <div className="metricCard">
            <div className="metricLabel">With media</div>
            <div className="metricValue">{stats.withMedia}</div>
          </div>

          <div className="metricCard">
            <div className="metricLabel">Verified</div>
            <div className="metricValue">{stats.verified}</div>
          </div>

          <div className="metricCard">
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
            Pulling network submissions from Supabase and matching them to operator profiles.
          </div>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="panel emptyTelemetryState">
          <div className="sectionKicker">NO OBSERVATIONS YET</div>
          <h2 className="sectionTitle">Your feed is ready for real data.</h2>
        </section>
      ) : (
        <div className="telemetryFeedGrid">
          {filteredItems.map((item) => {
            const primaryMedia = item.media[0] ?? null;
            const timestamp = item.observedAt ?? item.createdAt;
            const isOwnPost = item.userId === sessionUserId;

            return (
              <article
                key={item.id}
                className={`panel feedCard ${primaryMedia ? "withMedia" : "noMedia"} ${
                  item.isPro ? "proFeedCard" : ""
                }`}
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
                        {isOwnPost ? <span className="statusPill tiny">You</span> : null}
                      </div>

                      <div className="feedMetaLine">
                        {[item.role, item.location].filter(Boolean).join(" • ") || "Network Operator"}
                      </div>
                    </div>
                  </div>

                  <span className={`statusBadge ${getStatusClass(item.status)}`}>
                    {item.status}
                  </span>
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

        .feedAvatar{
          width:48px;
          height:48px;
          object-fit:cover;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.05);
          flex-shrink:0;
        }

        .feedAvatar.fallback{
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

        .solarGoldChip{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:5px 10px;
          border-radius:999px;
          border:1px solid rgba(242,191,87,0.26);
          background:rgba(242,191,87,0.10);
          color:#ffe4a5;
          font-weight:800;
          font-size:11px;
          letter-spacing:0.08em;
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

          .feedTimeBlock{
            text-align:left;
          }
        }

        @media (max-width: 640px){
          .telemetryStats,
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
        }
      `}</style>
    </div>
  );
}
