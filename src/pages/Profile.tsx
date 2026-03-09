import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { openCustomerPortal } from "../lib/stripe";
import { supabase } from "../lib/supabaseClient";

type ProfileRow = {
  id?: string;
  callsign?: string | null;
  display_name?: string | null;
  role?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  observatory_name?: string | null;
  primary_mode?: string | null;
  equipment_summary?: string | null;
  specialties?: string[] | string | null;
  favorite_targets?: string[] | string | null;
  website_url?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
  discord_handle?: string | null;
  visibility?: string | null;
  accent_pref?: string | null;
  observation_index?: number | null;
  campaign_impact?: number | null;
};

type FormState = {
  callsign: string;
  displayName: string;
  bio: string;
  city: string;
  country: string;
  observatoryName: string;
  primaryMode: string;
  equipmentSummary: string;
  specialties: string;
  favoriteTargets: string;
  websiteUrl: string;
  xUrl: string;
  instagramUrl: string;
  discordHandle: string;
  visibility: string;
  accentPref: string;
};

type ProfileStats = {
  observations: number;
  verified: number;
  mediaPosts: number;
  latestAt: string | null;
};

const PROFILE_MEDIA_BUCKET = "profile-media";

const INITIAL_FORM: FormState = {
  callsign: "",
  displayName: "",
  bio: "",
  city: "",
  country: "",
  observatoryName: "",
  primaryMode: "visual",
  equipmentSummary: "",
  specialties: "",
  favoriteTargets: "",
  websiteUrl: "",
  xUrl: "",
  instagramUrl: "",
  discordHandle: "",
  visibility: "public",
  accentPref: "violet",
};

const ALIAS_PREFIXES = [
  "Aurora",
  "Vector",
  "Helio",
  "Nova",
  "Orion",
  "Zenith",
  "Polar",
  "Echo",
  "Vanta",
  "Lumen",
  "Apex",
  "Peri",
  "Atlas",
  "Sable",
  "Crux",
  "Pulse",
];

const ALIAS_SUFFIXES = [
  "Array",
  "Signal",
  "Observer",
  "Beacon",
  "Drift",
  "Transit",
  "Relay",
  "Axis",
  "Specter",
  "Emitter",
  "Ranger",
  "Scope",
  "Arc",
  "Node",
  "Tracer",
  "Vector",
];

function arrayToInput(value: string[] | string | null | undefined) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function inputToArray(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
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
    ];
    return nested.flatMap((candidate) => extractStringArray(candidate));
  }

  return [];
}

function normalizeMediaCount(observations: Record<string, unknown>[]) {
  return observations.reduce((count, row) => {
    const values = [
      row.image_url,
      row.image_urls,
      row.file_urls,
      row.media_urls,
      row.files,
      row.uploads,
      row.attachments,
    ];
    const media = values.flatMap((value) => extractStringArray(value));
    return count + (media.length > 0 ? 1 : 0);
  }, 0);
}

function generateAlias(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const prefix = ALIAS_PREFIXES[hash % ALIAS_PREFIXES.length];
  const suffix = ALIAS_SUFFIXES[(hash >> 5) % ALIAS_SUFFIXES.length];
  const code = String((hash % 9000) + 1000);

  return `${prefix} ${suffix} ${code}`;
}

function getOperatorLevel(oi: number, ci: number) {
  const combined = oi + ci;

  if (combined >= 6000) return { level: 6, role: "Research Commander" };
  if (combined >= 3000) return { level: 5, role: "Campaign Lead" };
  if (combined >= 1500) return { level: 4, role: "Array Specialist" };
  if (combined >= 750) return { level: 3, role: "Senior Operator" };
  if (combined >= 250) return { level: 2, role: "Field Operator" };
  return { level: 1, role: "Cadet Operator" };
}

function makeStoragePath(userId: string, folder: "avatar" | "banner", file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "jpg" : "jpg";
  return `${userId}/${folder}/${Date.now()}-${folder}.${ext}`;
}

async function uploadProfileImage(userId: string, folder: "avatar" | "banner", file: File) {
  const path = makeStoragePath(userId, folder, file);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function saveProfileWithFallback(payload: Record<string, unknown>) {
  const optionalKeys = [
    "display_name",
    "bio",
    "avatar_url",
    "banner_url",
    "observatory_name",
    "primary_mode",
    "equipment_summary",
    "specialties",
    "favorite_targets",
    "website_url",
    "x_url",
    "instagram_url",
    "discord_handle",
    "visibility",
    "accent_pref",
    "role",
  ];

  let workingPayload = { ...payload };

  while (true) {
    const { error } = await supabase.from("profiles").upsert(workingPayload, { onConflict: "id" });

    if (!error) return;

    const missingColumnMatch = error.message.match(/column ["']?([a-zA-Z0-9_]+)["']?/i);
    const missingColumn = missingColumnMatch?.[1];

    if (missingColumn && optionalKeys.includes(missingColumn) && missingColumn in workingPayload) {
      delete workingPayload[missingColumn];
      continue;
    }

    throw error;
  }
}

export default function Profile() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [stats, setStats] = useState<ProfileStats>({
    observations: 0,
    verified: 0,
    mediaPosts: 0,
    latestAt: null,
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [storedOI, setStoredOI] = useState<number>(0);
  const [storedCI, setStoredCI] = useState<number>(0);

  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (!user) throw new Error("Not signed in.");
        if (!active) return;

        setSessionUserId(user.id);
        setSessionEmail(user.email ?? null);

        const [{ data: row, error: profileError }, { data: observations, error: obsError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(`
                id,
                callsign,
                display_name,
                role,
                bio,
                city,
                country,
                avatar_url,
                banner_url,
                observatory_name,
                primary_mode,
                equipment_summary,
                specialties,
                favorite_targets,
                website_url,
                x_url,
                instagram_url,
                discord_handle,
                visibility,
                accent_pref,
                observation_index,
                campaign_impact
              `)
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("observations")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false }),
          ]);

        if (profileError) throw profileError;
        if (obsError) throw obsError;
        if (!active) return;

        const profile = (row as ProfileRow | null) ?? null;
        const observationRows = ((observations as Record<string, unknown>[] | null) ?? []);

        const oi = Number(profile?.observation_index ?? 0);
        const ci = Number(profile?.campaign_impact ?? 0);
        const generatedAlias = generateAlias(user.id);
        const safeDisplayName = profile?.display_name?.trim() || generatedAlias;

        setForm({
          callsign: profile?.callsign ?? "",
          displayName: safeDisplayName,
          bio: profile?.bio ?? "",
          city: profile?.city ?? "",
          country: profile?.country ?? "",
          observatoryName: profile?.observatory_name ?? "",
          primaryMode: profile?.primary_mode ?? "visual",
          equipmentSummary: profile?.equipment_summary ?? "",
          specialties: arrayToInput(profile?.specialties),
          favoriteTargets: arrayToInput(profile?.favorite_targets),
          websiteUrl: profile?.website_url ?? "",
          xUrl: profile?.x_url ?? "",
          instagramUrl: profile?.instagram_url ?? "",
          discordHandle: profile?.discord_handle ?? "",
          visibility: profile?.visibility ?? "public",
          accentPref: profile?.accent_pref ?? "violet",
        });

        setAvatarUrl(profile?.avatar_url ?? "");
        setBannerUrl(profile?.banner_url ?? "");
        setStoredOI(oi);
        setStoredCI(ci);

        const verified = observationRows.filter((obs) => {
          const raw = String(obs.verification_status ?? obs.status ?? "").toLowerCase();
          return ["verified", "approved", "confirmed"].includes(raw);
        }).length;

        setStats({
          observations: observationRows.length,
          verified,
          mediaPosts: normalizeMediaCount(observationRows),
          latestAt:
            typeof observationRows[0]?.observing_at === "string"
              ? String(observationRows[0].observing_at)
              : typeof observationRows[0]?.created_at === "string"
              ? String(observationRows[0].created_at)
              : null,
        });
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load profile.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
    type: "avatar" | "banner"
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!sessionUserId) {
      setError("You must be signed in to upload profile images.");
      return;
    }

    try {
      setError(null);
      if (type === "avatar") setAvatarUploading(true);
      else setBannerUploading(true);

      const publicUrl = await uploadProfileImage(sessionUserId, type, file);

      if (type === "avatar") setAvatarUrl(publicUrl);
      else setBannerUrl(publicUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to upload image.");
    } finally {
      if (type === "avatar") setAvatarUploading(false);
      else setBannerUploading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Not signed in.");

      const computedRole = getOperatorLevel(storedOI, storedCI).role;

      const payload: Record<string, unknown> = {
        id: user.id,
        callsign: form.callsign.trim() || null,
        display_name: form.displayName.trim() || generateAlias(user.id),
        role: computedRole,
        bio: form.bio.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        avatar_url: avatarUrl || null,
        banner_url: bannerUrl || null,
        observatory_name: form.observatoryName.trim() || null,
        primary_mode: form.primaryMode.trim() || null,
        equipment_summary: form.equipmentSummary.trim() || null,
        specialties: inputToArray(form.specialties),
        favorite_targets: inputToArray(form.favoriteTargets),
        website_url: form.websiteUrl.trim() || null,
        x_url: form.xUrl.trim() || null,
        instagram_url: form.instagramUrl.trim() || null,
        discord_handle: form.discordHandle.trim() || null,
        visibility: form.visibility.trim() || null,
        accent_pref: form.accentPref.trim() || null,
      };

      await saveProfileWithFallback(payload);
      setMessage("Profile updated.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const displayName =
    form.displayName.trim() || (sessionUserId ? generateAlias(sessionUserId) : "Array Operator");
  const location = [form.city.trim(), form.country.trim()].filter(Boolean).join(", ");
  const specialties = inputToArray(form.specialties);
  const computedRank = getOperatorLevel(storedOI, storedCI);

  const accentClass = useMemo(() => {
    if (form.accentPref === "cyan") return "accentCyan";
    if (form.accentPref === "amber") return "accentAmber";
    return "accentViolet";
  }, [form.accentPref]);

  return (
    <div className={`pageStack profilePage ${accentClass}`}>
      <section className="heroPanel profileHero">
        <div
          className="profileHeroBanner"
          style={
            bannerUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(6,10,20,0.35), rgba(6,10,20,0.68)), url(${bannerUrl})`,
                }
              : undefined
          }
        >
          <div className="profileHeroContent">
            <div className="profileIdentity">
              {avatarUrl ? (
                <img className="profileAvatar" src={avatarUrl} alt={displayName} />
              ) : (
                <div className="profileAvatar fallback">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="profileIdentityText">
                <div className="eyebrow">OPERATOR PROFILE</div>
                <h1 className="pageTitle">{displayName}</h1>
                <div className="profileMetaRow">
                  <span className="statusBadge profileMetaBadge">
                    {form.callsign.trim() || "No callsign set"}
                  </span>
                  <span>{computedRank.role}</span>
                  <span>Level {computedRank.level}</span>
                  {location ? <span>{location}</span> : null}
                </div>
                {form.bio.trim() ? <p className="pageText profileBio">{form.bio.trim()}</p> : null}
              </div>
            </div>

            <div className="profileHeroStats">
              <div className="metricCard">
                <div className="metricLabel">Observation Index</div>
                <div className="metricValue">{storedOI.toLocaleString()}</div>
              </div>
              <div className="metricCard">
                <div className="metricLabel">Campaign Impact</div>
                <div className="metricValue">{storedCI.toLocaleString()}</div>
              </div>
              <div className="metricCard">
                <div className="metricLabel">Observations</div>
                <div className="metricValue">{stats.observations.toLocaleString()}</div>
              </div>
              <div className="metricCard">
                <div className="metricLabel">Verified</div>
                <div className="metricValue">{stats.verified.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="panel">
          <div className="stateTitle">Loading profile…</div>
          <div className="stateText">Pulling operator settings, identity, and activity from Supabase.</div>
        </section>
      ) : null}

      <div className="gridTwo profileMainGrid profileTopGrid">
        <section className="panel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">IDENTITY</div>
              <h2 className="sectionTitle">Public operator profile</h2>
            </div>
          </div>

          <div className="formGrid">
            <div className="fieldGroup">
              <label className="fieldLabel">Callsign</label>
              <input
                className="input"
                value={form.callsign}
                onChange={(e) => updateField("callsign", e.target.value)}
                placeholder="HVRX-014"
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Public alias</label>
              <input
                className="input"
                value={form.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
                placeholder={sessionUserId ? generateAlias(sessionUserId) : "Operator Alias"}
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Role</label>
              <input className="input" value={computedRank.role} readOnly />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Primary mode</label>
              <select
                className="input"
                value={form.primaryMode}
                onChange={(e) => updateField("primaryMode", e.target.value)}
              >
                <option value="visual">Visual</option>
                <option value="radio">Radio</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="fieldGroup spanTwo">
              <label className="fieldLabel">Bio</label>
              <textarea
                className="input"
                rows={5}
                value={form.bio}
                onChange={(e) => updateField("bio", e.target.value)}
                placeholder="Tell the network what you observe, what your setup is, and what kind of campaigns you contribute to."
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">City</label>
              <input
                className="input"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="Memphis"
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Country</label>
              <input
                className="input"
                value={form.country}
                onChange={(e) => updateField("country", e.target.value)}
                placeholder="United States"
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Avatar image</label>
              <label className="uploadMiniCard">
                <input
                  className="srOnlyInput"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, "avatar")}
                />
                <span>{avatarUploading ? "Uploading avatar…" : "Upload avatar"}</span>
              </label>
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Banner image</label>
              <label className="uploadMiniCard">
                <input
                  className="srOnlyInput"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, "banner")}
                />
                <span>{bannerUploading ? "Uploading banner…" : "Upload banner"}</span>
              </label>
            </div>
          </div>
        </section>

        <section className="panel livePreviewPanel">
          <div className="sectionHeader">
            <div>
              <div className="sectionKicker">LIVE PREVIEW</div>
              <h2 className="sectionTitle">How your profile reads</h2>
            </div>
          </div>

          <article className="profilePreviewCard">
            <div className="profilePreviewContent">
              <div className="profilePreviewTop">
                {avatarUrl ? (
                  <img className="profilePreviewAvatar" src={avatarUrl} alt={displayName} />
                ) : (
                  <div className="profilePreviewAvatar fallback">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div>
                  <div className="profilePreviewName">{displayName}</div>
                  <div className="profilePreviewSub">
                    {[computedRank.role, location].filter(Boolean).join(" • ") || "Cadet Operator"}
                  </div>
                  {form.callsign.trim() ? (
                    <div className="profilePreviewCallsign">{form.callsign.trim()}</div>
                  ) : null}
                </div>
              </div>

              {form.bio.trim() ? (
                <p className="pageText previewBodyText">{form.bio.trim()}</p>
              ) : (
                <p className="pageText previewBodyText muted">
                  Add a bio so other operators can understand your focus and setup.
                </p>
              )}

              <div className="previewMetaGrid">
                <div className="previewMetaCard">
                  <span>Observatory</span>
                  <strong>{form.observatoryName.trim() || "Not set"}</strong>
                </div>
                <div className="previewMetaCard">
                  <span>Primary mode</span>
                  <strong>{form.primaryMode || "Visual"}</strong>
                </div>
                <div className="previewMetaCard full">
                  <span>Equipment</span>
                  <strong>{form.equipmentSummary.trim() || "No equipment summary set."}</strong>
                </div>
              </div>

              {specialties.length > 0 ? (
                <div className="feedTags">
                  {specialties.map((item) => (
                    <span key={item} className="feedTag">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        </section>
      </div>

      <section className="panel fullWidthPanel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">OPERATOR SETUP</div>
            <h2 className="sectionTitle">Observatory and specialties</h2>
          </div>
        </div>

        <div className="formGrid">
          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Observatory name</label>
            <input
              className="input"
              value={form.observatoryName}
              onChange={(e) => updateField("observatoryName", e.target.value)}
              placeholder="Helvarix South Array"
            />
          </div>

          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Equipment summary</label>
            <textarea
              className="input"
              rows={5}
              value={form.equipmentSummary}
              onChange={(e) => updateField("equipmentSummary", e.target.value)}
              placeholder="Describe your telescope, camera, mount, SDR, antenna, dish, processing stack, or anything else you want visible on your profile."
            />
          </div>

          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Specialties</label>
            <input
              className="input"
              value={form.specialties}
              onChange={(e) => updateField("specialties", e.target.value)}
              placeholder="deep sky, planetary, hydrogen line, transient tracking"
            />
          </div>

          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Favorite targets</label>
            <input
              className="input"
              value={form.favoriteTargets}
              onChange={(e) => updateField("favoriteTargets", e.target.value)}
              placeholder="M31, Veil Nebula, Jupiter, Cassiopeia A"
            />
          </div>
        </div>
      </section>

      <section className="panel fullWidthPanel compactPanel">
        <div className="sectionHeader compactHeader">
          <div>
            <div className="sectionKicker">NETWORK LINKS</div>
            <h2 className="sectionTitle">Public links and handles</h2>
          </div>
        </div>

        <div className="formGrid compactFormGrid">
          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Website</label>
            <input
              className="input"
              value={form.websiteUrl}
              onChange={(e) => updateField("websiteUrl", e.target.value)}
              placeholder="https://your-site.com"
            />
          </div>

          <div className="fieldGroup">
            <label className="fieldLabel">X</label>
            <input
              className="input"
              value={form.xUrl}
              onChange={(e) => updateField("xUrl", e.target.value)}
              placeholder="https://x.com/..."
            />
          </div>

          <div className="fieldGroup">
            <label className="fieldLabel">Instagram</label>
            <input
              className="input"
              value={form.instagramUrl}
              onChange={(e) => updateField("instagramUrl", e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </div>

          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Discord handle</label>
            <input
              className="input"
              value={form.discordHandle}
              onChange={(e) => updateField("discordHandle", e.target.value)}
              placeholder="@helvarix-operator"
            />
          </div>
        </div>
      </section>

      <section className="panel fullWidthPanel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">PREFERENCES</div>
            <h2 className="sectionTitle">Visibility and page styling</h2>
          </div>
        </div>

        <div className="formGrid">
          <div className="fieldGroup">
            <label className="fieldLabel">Visibility</label>
            <select
              className="input"
              value={form.visibility}
              onChange={(e) => updateField("visibility", e.target.value)}
            >
              <option value="public">Public</option>
              <option value="network">Network only</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div className="fieldGroup">
            <label className="fieldLabel">Accent preference</label>
            <select
              className="input"
              value={form.accentPref}
              onChange={(e) => updateField("accentPref", e.target.value)}
            >
              <option value="violet">Violet</option>
              <option value="cyan">Cyan</option>
              <option value="amber">Amber</option>
            </select>
          </div>

          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Account email</label>
            <input className="input" value={sessionEmail ?? ""} readOnly />
          </div>
        </div>
      </section>

      <section className="panel fullWidthPanel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">ACCOUNT STATUS</div>
            <h2 className="sectionTitle">Network activity and controls</h2>
          </div>
        </div>

        <div className="gridFour compactStats profileStatsGrid">
          <div className="metricCard">
            <div className="metricLabel">Observations</div>
            <div className="metricValue">{stats.observations}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Verified</div>
            <div className="metricValue">{stats.verified}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Media posts</div>
            <div className="metricValue">{stats.mediaPosts}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Last active</div>
            <div className="metricValue smallMetric">{formatDate(stats.latestAt)}</div>
          </div>
        </div>

        <div className="profileActionCard">
          <div>
            <div className="sectionKicker">BILLING + SAVE</div>
            <h3 className="profileActionTitle">Manage your operator account</h3>
            <p className="profileActionText">
              Save your customization changes to Supabase and manage subscription details from the billing portal.
            </p>
          </div>

          <div className="buttonRow">
            <button
              className="primaryBtn"
              type="button"
              onClick={saveProfile}
              disabled={saving || avatarUploading || bannerUploading}
            >
              {saving ? "Saving…" : "Save profile"}
            </button>

            <button
              className="ghostBtn"
              type="button"
              onClick={() =>
                openCustomerPortal().catch((err: Error) => {
                  setError(err.message);
                })
              }
            >
              Open billing portal
            </button>
          </div>
        </div>

        {message ? <div className="alert info">{message}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
      </section>

      <style>{`
        .profileHeroBanner{
          border-radius: 24px;
          overflow: hidden;
          min-height: 320px;
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.14), transparent 34%),
            radial-gradient(circle at top right, rgba(124,58,237,0.18), transparent 30%),
            linear-gradient(180deg, rgba(10,18,34,0.92), rgba(7,12,24,0.96));
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255,255,255,0.06);
        }

        .profileHeroContent{
          min-height: 320px;
          padding: 28px;
          display:grid;
          align-content:space-between;
          gap: 22px;
          background: linear-gradient(180deg, rgba(6,10,20,0.18), rgba(6,10,20,0.62));
        }

        .profileIdentity{
          display:flex;
          gap: 18px;
          align-items:flex-start;
        }

        .profileAvatar{
          width: 110px;
          height: 110px;
          border-radius: 999px;
          object-fit: cover;
          border: 2px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          flex-shrink:0;
        }

        .profileAvatar.fallback,
        .profilePreviewAvatar.fallback{
          display:grid;
          place-items:center;
          font-weight:900;
          color: var(--cyan);
        }

        .profileMetaRow{
          display:flex;
          flex-wrap:wrap;
          gap: 10px;
          margin-top: 10px;
          color: var(--muted);
          font-size: 14px;
          line-height:1.4;
        }

        .profileMetaBadge{
          white-space: nowrap;
        }

        .profileBio{
          max-width: 860px;
          margin-top: 14px;
        }

        .profileHeroStats{
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .profileMainGrid{
          align-items:start;
        }

        .profileTopGrid{
          align-items: stretch;
        }

        .fullWidthPanel{
          width: 100%;
        }

        .compactPanel{
          padding-bottom: 18px;
        }

        .compactHeader{
          margin-bottom: 10px;
        }

        .compactFormGrid{
          gap: 16px;
        }

        .uploadMiniCard{
          min-height: 56px;
          border-radius: 16px;
          border: 1px dashed rgba(92,214,255,0.24);
          background: rgba(255,255,255,0.03);
          display:flex;
          align-items:center;
          padding: 0 16px;
          cursor:pointer;
          transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
        }

        .uploadMiniCard:hover{
          border-color: rgba(92,214,255,0.42);
          background: rgba(92,214,255,0.06);
          transform: translateY(-1px);
        }

        .uploadMiniCard span{
          font-weight: 700;
        }

        .srOnlyInput{
          position:absolute;
          width:1px;
          height:1px;
          padding:0;
          margin:-1px;
          overflow:hidden;
          clip:rect(0,0,0,0);
          white-space:nowrap;
          border:0;
        }

        .livePreviewPanel{
          display:flex;
          flex-direction:column;
          overflow:hidden;
        }

        .profilePreviewCard{
          flex:1;
          display:block;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(92,214,255,0.12);
          background: linear-gradient(180deg, rgba(12,20,38,0.92), rgba(8,14,28,0.92));
          overflow:hidden;
        }

        .profilePreviewContent{
          display:grid;
          gap: 18px;
          height:100%;
          align-content:start;
        }

        .profilePreviewTop{
          display:flex;
          gap: 14px;
          align-items:center;
        }

        .profilePreviewAvatar{
          width: 72px;
          height: 72px;
          border-radius: 999px;
          object-fit:cover;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          flex-shrink:0;
        }

        .profilePreviewName{
          font-size: 24px;
          font-weight: 800;
          line-height: 1.08;
        }

        .profilePreviewSub{
          margin-top: 6px;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.45;
        }

        .profilePreviewCallsign{
          margin-top: 8px;
          display:inline-flex;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 12px;
          border: 1px solid rgba(92,214,255,0.16);
          background: rgba(92,214,255,0.08);
        }

        .previewBodyText{
          margin: 0;
        }

        .previewBodyText.muted{
          opacity: 0.78;
        }

        .previewMetaGrid{
          display:grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 12px;
        }

        .previewMetaCard{
          padding: 14px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          display:grid;
          gap: 8px;
        }

        .previewMetaCard span{
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .previewMetaCard strong{
          line-height: 1.5;
          font-size: 14px;
        }

        .previewMetaCard.full{
          grid-column: 1 / -1;
        }

        .profileStatsGrid{
          margin-top: 6px;
        }

        .smallMetric{
          font-size: 18px;
        }

        .profileActionCard{
          margin-top: 18px;
          display:grid;
          gap: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(92,214,255,0.12);
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.06), transparent 42%),
            linear-gradient(180deg, rgba(11,18,34,0.88), rgba(8,14,28,0.92));
        }

        .profileActionTitle{
          margin: 6px 0 0;
          font-size: 24px;
          line-height: 1.08;
        }

        .profileActionText{
          margin: 10px 0 0;
          color: var(--muted);
          line-height: 1.6;
        }

        .feedTags{
          display:flex;
          flex-wrap:wrap;
          gap: 10px;
        }

        .feedTag{
          display:inline-flex;
          align-items:center;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          border: 1px solid rgba(92,214,255,0.16);
          background: rgba(92,214,255,0.08);
          color: var(--text);
        }

        .accentViolet .profileHeroBanner{
          box-shadow: 0 28px 80px rgba(124,58,237,0.10);
        }

        .accentCyan .profileHeroBanner{
          box-shadow: 0 28px 80px rgba(41,217,255,0.10);
        }

        .accentAmber .profileHeroBanner{
          box-shadow: 0 28px 80px rgba(246,196,83,0.10);
        }

        .accentCyan .profilePreviewCallsign,
        .accentCyan .feedTag{
          border-color: rgba(41,217,255,0.20);
          background: rgba(41,217,255,0.10);
        }

        .accentAmber .profilePreviewCallsign,
        .accentAmber .feedTag{
          border-color: rgba(246,196,83,0.20);
          background: rgba(246,196,83,0.10);
        }

        @media (max-width: 980px){
          .profileHeroStats{
            grid-template-columns: repeat(2, minmax(0,1fr));
          }
        }

        @media (max-width: 820px){
          .profileTopGrid{
            align-items:start;
          }

          .profileIdentity,
          .profilePreviewTop{
            display:grid;
            grid-template-columns: 1fr;
          }

          .profileAvatar{
            width: 92px;
            height: 92px;
          }
        }

        @media (max-width: 640px){
          .profileHeroContent{
            padding: 18px;
          }

          .profileHeroStats,
          .previewMetaGrid{
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
