import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type SubmissionMode = "visual" | "radio";
type CampaignCadence = "DAILY" | "WEEKLY" | "GLOBAL" | "RESEARCH" | "COLLECTIVE" | "UNKNOWN";

type ProfileRow = {
  id: string;
  callsign: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  avatar_url?: string | null;
  observation_index?: number | null;
};

type CampaignRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  cadence?: string | null;
  scope?: string | null;
  type?: string | null;
  tags?: string[] | null;
  description?: string | null;
  is_active?: boolean | null;
};

type FormState = {
  target: string;
  observingAt: string;
  bortleClass: string;
  signalQuality: string;
  equipment: string;
  notes: string;
  tags: string;
  campaignId: string;
};

type UploadAsset = {
  file: File;
  kind: "image" | "data";
  previewUrl: string | null;
};

const MEDIA_BUCKET = "observation-media";

const INITIAL_FORM: FormState = {
  target: "",
  observingAt: "",
  bortleClass: "4",
  signalQuality: "",
  equipment: "",
  notes: "",
  tags: "",
  campaignId: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function splitTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
    )
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function fileExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function buildPreviewUrl(file: File) {
  return isImageFile(file) ? URL.createObjectURL(file) : null;
}

function createObservationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCadence(value: string | null | undefined): CampaignCadence {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw.includes("daily")) return "DAILY";
  if (raw.includes("weekly")) return "WEEKLY";
  if (raw.includes("global")) return "GLOBAL";
  if (raw.includes("research")) return "RESEARCH";
  if (raw.includes("collective")) return "COLLECTIVE";

  return "UNKNOWN";
}

function getCampaignLabel(campaign: CampaignRow | null | undefined) {
  return campaign?.title?.trim() || campaign?.name?.trim() || "Unnamed Campaign";
}

function getCampaignCadenceBadge(campaign: CampaignRow | null | undefined): CampaignCadence {
  return normalizeCadence(
    campaign?.cadence ?? campaign?.scope ?? campaign?.type ?? campaign?.title ?? campaign?.name
  );
}

function getCampaignExplanation(cadence: CampaignCadence) {
  if (cadence === "DAILY") return "Applies a 1.3× Observation Index multiplier.";
  if (cadence === "WEEKLY") return "Applies a 1.5× Observation Index multiplier.";
  if (cadence === "GLOBAL") return "Counts toward Campaign Impact.";
  if (cadence === "RESEARCH") return "Counts toward Campaign Impact with research weighting.";
  if (cadence === "COLLECTIVE") return "Counts toward Campaign Impact with collective weighting.";
  return "General submission with no special campaign multiplier detected.";
}

async function uploadAsset(userId: string, observationId: string, asset: UploadAsset) {
  const ext = fileExtension(asset.file.name) || "bin";
  const safeName = slugify(asset.file.name.replace(/\.[^/.]+$/, "")) || "upload";
  const folder = asset.kind === "image" ? "images" : "files";
  const path = `${userId}/${observationId}/${folder}/${Date.now()}-${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, asset.file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  return {
    url: data.publicUrl,
    path,
    name: asset.file.name,
    size: asset.file.size,
    type: asset.file.type,
    kind: asset.kind,
  };
}

async function insertObservationWithFallback(payload: Record<string, unknown>) {
  const optionalKeys = [
    "image_urls",
    "file_urls",
    "media_urls",
    "files",
    "bortle_class",
    "signal_quality",
    "campaign_id",
    "campaign_title",
    "campaign_name",
    "campaign_scope",
    "campaign_type",
    "campaign_cadence",
  ];

  let workingPayload = { ...payload };

  while (true) {
    const { error } = await supabase.from("observations").insert(workingPayload);

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

export default function Submit() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<SubmissionMode>("visual");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [assets, setAssets] = useState<UploadAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignLoadError, setCampaignLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInitialData() {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const user = authData.session?.user ?? null;

        if (!mounted) return;
        setSessionUserId(user?.id ?? null);

        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("id,callsign,role,city,country,avatar_url,observation_index")
            .eq("id", user.id)
            .maybeSingle();

          if (mounted && data) setProfile(data as ProfileRow);
        }

        try {
          const { data, error: campaignsError } = await supabase
            .from("campaigns")
            .select("id,title,name,cadence,scope,type,tags,description,is_active")
            .order("is_active", { ascending: false })
            .order("title", { ascending: true });

          if (campaignsError) throw campaignsError;

          if (mounted) {
            const usable = ((data as CampaignRow[] | null) ?? []).filter(
              (campaign) => campaign.is_active !== false
            );
            setCampaigns(usable);
          }
        } catch (campaignErr) {
          console.error("Unable to load campaigns:", campaignErr);
          if (mounted) {
            setCampaignLoadError(
              campaignErr instanceof Error ? campaignErr.message : "Unable to load campaigns."
            );
            setCampaigns([]);
          }
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load submission form.");
        }
      }
    }

    loadInitialData();

    return () => {
      mounted = false;
      assets.forEach((asset) => {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onAddFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length === 0) return;

    const nextAssets = nextFiles.map<UploadAsset>((file) => ({
      file,
      kind: isImageFile(file) ? "image" : "data",
      previewUrl: buildPreviewUrl(file),
    }));

    setAssets((current) => [...current, ...nextAssets]);
    event.target.value = "";
  }

  function removeAsset(index: number) {
    setAssets((current) => {
      const item = current[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  const imageAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "image"),
    [assets]
  );

  const dataAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "data"),
    [assets]
  );

  const socialLocation = [profile?.city, profile?.country].filter(Boolean).join(", ");

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === form.campaignId) ?? null,
    [campaigns, form.campaignId]
  );

  const selectedCadence = getCampaignCadenceBadge(selectedCampaign);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const user = authData.session?.user;

      if (!user) throw new Error("You must be signed in to submit an observation.");
      if (!form.target.trim()) throw new Error("Please enter a target.");
      if (!form.observingAt) throw new Error("Please choose the observation date and time.");
      if (!form.equipment.trim()) throw new Error("Please enter equipment details.");
      if (!form.notes.trim()) throw new Error("Please enter observation notes.");

      const observationId = createObservationId();

      const uploaded = [];
      for (const asset of assets) {
        uploaded.push(await uploadAsset(user.id, observationId, asset));
      }

      const imageUrls = uploaded.filter((item) => item.kind === "image").map((item) => item.url);
      const dataUrls = uploaded.filter((item) => item.kind === "data").map((item) => item.url);
      const mediaUrls = uploaded.map((item) => item.url);

      const tags = splitTags(form.tags);

      if (!tags.includes(mode)) tags.unshift(mode);
      if (mode === "visual" && !tags.includes("optical")) tags.push("optical");
      if (mode === "radio" && !tags.includes("radio")) tags.push("radio");

      if (selectedCampaign) {
        const campaignLabel = getCampaignLabel(selectedCampaign);
        const cadenceTag = selectedCadence.toLowerCase();
        if (!tags.includes("campaign")) tags.push("campaign");
        if (campaignLabel && !tags.includes(slugify(campaignLabel))) tags.push(slugify(campaignLabel));
        if (selectedCadence !== "UNKNOWN" && !tags.includes(cadenceTag)) tags.push(cadenceTag);
      }

      const payload: Record<string, unknown> = {
        id: observationId,
        user_id: user.id,
        created_at: new Date().toISOString(),
        observing_at: new Date(form.observingAt).toISOString(),
        mode,
        target: form.target.trim(),
        equipment: form.equipment.trim(),
        notes: form.notes.trim(),
        description: form.notes.trim(),
        tags,
        status: "pending",
        verification_status: "pending",
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        file_urls: dataUrls,
        media_urls: mediaUrls,
        files: uploaded,
        bortle_class: mode === "visual" ? Number(form.bortleClass) : null,
        signal_quality: form.signalQuality.trim() || null,
        campaign_id: selectedCampaign?.id ?? null,
        campaign_title: selectedCampaign?.title ?? null,
        campaign_name: selectedCampaign?.name ?? selectedCampaign?.title ?? null,
        campaign_scope: selectedCampaign?.scope ?? null,
        campaign_type: selectedCampaign?.type ?? null,
        campaign_cadence: selectedCadence !== "UNKNOWN" ? selectedCadence : null,
      };

      await insertObservationWithFallback(payload);

      if (profile && sessionUserId) {
        await supabase
          .from("profiles")
          .update({
            observation_index: (profile.observation_index ?? 0) + 1,
          })
          .eq("id", sessionUserId);
      }

      setSaveMessage("Observation submitted. Routing to telemetry feed…");

      setForm(INITIAL_FORM);
      assets.forEach((asset) => {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      });
      setAssets([]);

      window.setTimeout(() => {
        navigate("/telemetry");
      }, 700);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to submit observation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="heroPanel submitHero">
        <div className="submitHeroTop">
          <div>
            <div className="eyebrow">OBSERVATION INTAKE</div>
            <h1 className="pageTitle">Field-ready submission flow.</h1>
            <p className="pageText submitHeroText">
              Visual and radio observations submit directly into the live network feed, with photos,
              support files, and campaign attachment for deterministic leaderboard scoring.
            </p>
          </div>

          <div className="statusBadge neutral submitModeBadge">
            <span className="statusDot" />
            {mode === "visual" ? "VISUAL MODE" : "RADIO MODE"}
          </div>
        </div>

        <div className="gridFour compactStats">
          <div className="metricCard">
            <div className="metricLabel">Mode</div>
            <div className="metricValue">{mode === "visual" ? "Visual" : "Radio"}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Images queued</div>
            <div className="metricValue">{imageAssets.length}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Files queued</div>
            <div className="metricValue">{dataAssets.length}</div>
          </div>
          <div className="metricCard">
            <div className="metricLabel">Operator</div>
            <div className="metricValue">{profile?.callsign?.trim() || "Array Operator"}</div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="pageStack">
        <section className="panel">
          <div className="tabRow">
            <button
              className={`tabBtn ${mode === "visual" ? "active" : ""}`}
              type="button"
              onClick={() => setMode("visual")}
            >
              Visual
            </button>
            <button
              className={`tabBtn ${mode === "radio" ? "active" : ""}`}
              type="button"
              onClick={() => setMode("radio")}
            >
              Radio
            </button>
          </div>

          <div className="formGrid">
            <div className="fieldGroup">
              <label className="fieldLabel">Target</label>
              <input
                className="input"
                value={form.target}
                onChange={(e) => updateField("target", e.target.value)}
                placeholder={
                  mode === "radio"
                    ? "Hydrogen line region, solar burst, pulsar, meteor scatter"
                    : "M31, NGC 7000, Jupiter, Orion Nebula"
                }
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">Observation date and time</label>
              <input
                className="input"
                type="datetime-local"
                value={form.observingAt}
                onChange={(e) => updateField("observingAt", e.target.value)}
              />
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">
                {mode === "visual" ? "Bortle class" : "Local noise / interference"}
              </label>
              {mode === "visual" ? (
                <select
                  className="input"
                  value={form.bortleClass}
                  onChange={(e) => updateField("bortleClass", e.target.value)}
                >
                  {Array.from({ length: 9 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {`Class ${i + 1}`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={form.bortleClass}
                  onChange={(e) => updateField("bortleClass", e.target.value)}
                  placeholder="Urban RF noise, local interference, quiet rural band"
                />
              )}
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel">
                {mode === "visual" ? "Seeing / transparency" : "Signal quality"}
              </label>
              <input
                className="input"
                value={form.signalQuality}
                onChange={(e) => updateField("signalQuality", e.target.value)}
                placeholder={
                  mode === "visual"
                    ? "1.8 arcsec, clear, light haze"
                    : "24 dB SNR, stable, intermittent"
                }
              />
            </div>

            <div className="fieldGroup spanTwo">
              <label className="fieldLabel">Campaign attachment</label>
              <select
                className="input"
                value={form.campaignId}
                onChange={(e) => updateField("campaignId", e.target.value)}
              >
                <option value="">No campaign attached</option>
                {campaigns.map((campaign) => {
                  const cadence = getCampaignCadenceBadge(campaign);
                  return (
                    <option key={campaign.id} value={campaign.id}>
                      {`${getCampaignLabel(campaign)}${cadence !== "UNKNOWN" ? ` — ${cadence}` : ""}`}
                    </option>
                  );
                })}
              </select>

              {selectedCampaign ? (
                <div className="campaignInfoCard">
                  <div className="campaignInfoTop">
                    <span className="statusBadge campaignBadge">{selectedCadence}</span>
                    <strong>{getCampaignLabel(selectedCampaign)}</strong>
                  </div>
                  <div className="campaignInfoText">{getCampaignExplanation(selectedCadence)}</div>
                  {selectedCampaign.description ? (
                    <div className="campaignInfoSub">{selectedCampaign.description}</div>
                  ) : null}
                </div>
              ) : (
                <div className="campaignInfoCard muted">
                  <div className="campaignInfoTop">
                    <span className="statusBadge campaignBadge">GENERAL</span>
                    <strong>Independent observation</strong>
                  </div>
                  <div className="campaignInfoText">
                    Submit without a campaign if this observation is not tied to a daily, weekly,
                    global, research, or collective objective.
                  </div>
                </div>
              )}

              {campaignLoadError ? (
                <div className="helperError">
                  Campaigns could not be loaded from Supabase. General submission still works.
                </div>
              ) : null}
            </div>

            <div className="fieldGroup spanTwo">
              <label className="fieldLabel">Equipment</label>
              <textarea
                className="input"
                rows={4}
                value={form.equipment}
                onChange={(e) => updateField("equipment", e.target.value)}
                placeholder={
                  mode === "visual"
                    ? "Telescope, mount, camera, filters, guiding, capture software, processing software…"
                    : "Dish, antenna, SDR, receiver chain, amplifiers, software, filters, frequency plan…"
                }
              />
            </div>

            <div className="fieldGroup spanTwo">
              <label className="fieldLabel">Observation notes</label>
              <textarea
                className="input"
                rows={6}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Describe conditions, capture method, anomalies, verification steps, and what another observer should know."
              />
            </div>

            <div className="fieldGroup spanTwo">
              <label className="fieldLabel">Tags</label>
              <input
                className="input"
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                placeholder="galaxy, narrowband, lunar, solar, hydrogen-line, meteor-scatter"
              />
            </div>
          </div>
        </section>

        <section className="gridTwo submitGrid">
          <section className="panel leftSubmissionColumn">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">MEDIA + FILES</div>
                <h2 className="sectionTitle">
                  {mode === "visual" ? "Photos and supporting data" : "Images and radio attachments"}
                </h2>
              </div>
            </div>

            <div className="uploadPanel">
              <label className="uploadDropZone">
                <input
                  type="file"
                  multiple
                  onChange={onAddFiles}
                  className="srOnlyInput"
                  accept={
                    mode === "visual"
                      ? "image/*,.json,.csv,.txt,.fits,.fit,.xisf,.ser,.dat,.tsv"
                      : "image/*,.json,.csv,.txt,.wav,.iq,.sigmf,.dat,.bin"
                  }
                />
                <div className="uploadDropZoneInner">
                  <div className="uploadIcon">⬆</div>
                  <div className="uploadTitle">
                    {mode === "visual"
                      ? "Add target photos, calibrated exports, JSON, CSV, or spectral/photometric support files"
                      : "Add radio plots, setup photos, captures, JSON, CSV, IQ, WAV, or support files"}
                  </div>
                  <div className="helperText">
                    Images become the primary feed media. Other files stay attached to the observation record.
                  </div>
                </div>
              </label>

              {assets.length === 0 ? (
                <div className="emptyState uploadEmpty">
                  No files queued yet.
                </div>
              ) : (
                <div className="assetList">
                  {assets.map((asset, index) => (
                    <div key={`${asset.file.name}-${index}`} className="assetRow">
                      <div className="assetThumb">
                        {asset.previewUrl ? (
                          <img src={asset.previewUrl} alt={asset.file.name} className="assetImage" />
                        ) : (
                          <div className="assetFileBadge">
                            .{fileExtension(asset.file.name) || "file"}
                          </div>
                        )}
                      </div>

                      <div className="assetMeta">
                        <div className="assetName">{asset.file.name}</div>
                        <div className="assetSub">
                          {asset.kind === "image" ? "Image" : "Data / Attachment"} •{" "}
                          {formatBytes(asset.file.size)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="ghostBtn compactBtn removeAssetBtn"
                        onClick={() => removeAsset(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="submitActionCard">
                <div className="submitActionMeta">
                  <div className="sectionKicker">FINALIZE</div>
                  <h3 className="submitActionTitle">Publish to telemetry</h3>
                  <p className="submitActionText">
                    This submission writes to observations, attaches uploads, stores campaign context,
                    and appears in the live feed under your profile.
                  </p>
                </div>

                <div className="submitActionButtons">
                  <button className="primaryBtn actionPrimary" type="submit" disabled={saving}>
                    {saving ? "Submitting…" : "Submit observation"}
                  </button>

                  <button
                    className="ghostBtn actionSecondary"
                    type="button"
                    onClick={() => {
                      setForm(INITIAL_FORM);
                      assets.forEach((asset) => {
                        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
                      });
                      setAssets([]);
                      setSaveMessage(null);
                      setError(null);
                    }}
                    disabled={saving}
                  >
                    Reset form
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="sectionHeader">
              <div>
                <div className="sectionKicker">FEED PREVIEW</div>
                <h2 className="sectionTitle">What operators will see</h2>
              </div>
            </div>

            <article className="submitPreviewCard">
              <div className="submitPreviewHeader">
                <div className="submitIdentity">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.callsign ?? "Array Operator"}
                      className="submitAvatar"
                    />
                  ) : (
                    <div className="submitAvatar fallback">
                      {(profile?.callsign?.[0] ?? "A").toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="submitCallsignRow">
                      <strong>{profile?.callsign?.trim() || "Array Operator"}</strong>
                      <span className="statusPill tiny">Pending</span>
                    </div>
                    <div className="submitIdentitySub">
                      {[profile?.role, socialLocation].filter(Boolean).join(" • ") || "Network Operator"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="submitPreviewMedia">
                {imageAssets[0]?.previewUrl ? (
                  <img
                    src={imageAssets[0].previewUrl}
                    alt="Observation preview"
                    className="submitPreviewImage"
                  />
                ) : (
                  <div className="submitPreviewPlaceholder">
                    <div className="placeholderMode">{mode.toUpperCase()}</div>
                    <div className="placeholderTarget">
                      {form.target.trim() || "Target preview"}
                    </div>
                    <div className="placeholderSub">
                      Add a photo to make the feed card image-first.
                    </div>
                  </div>
                )}
              </div>

              <div className="submitPreviewBody">
                <div className="sectionKicker">
                  {mode === "visual" ? "VISUAL OBSERVATION" : "RADIO OBSERVATION"}
                </div>
                <h3 className="submitPreviewTarget">
                  {form.target.trim() || "Untitled Observation"}
                </h3>

                {selectedCampaign ? (
                  <div className="previewCampaignRow">
                    <span className="statusBadge campaignBadge">{selectedCadence}</span>
                    <span className="previewCampaignText">{getCampaignLabel(selectedCampaign)}</span>
                  </div>
                ) : null}

                {form.notes.trim() ? (
                  <p className="pageText previewNotes">{form.notes.trim()}</p>
                ) : (
                  <p className="pageText previewNotes muted">
                    Observation notes will appear here in the telemetry feed.
                  </p>
                )}

                <div className="previewMetaGrid">
                  <div className="previewMetaCard">
                    <span>Images</span>
                    <strong>{imageAssets.length}</strong>
                  </div>
                  <div className="previewMetaCard">
                    <span>Files</span>
                    <strong>{dataAssets.length}</strong>
                  </div>
                  <div className="previewMetaCard full">
                    <span>Equipment</span>
                    <strong>{form.equipment.trim() || "No equipment entered yet."}</strong>
                  </div>
                </div>

                {splitTags(form.tags).length > 0 ? (
                  <div className="feedTags">
                    {splitTags(form.tags).map((tag) => (
                      <span key={tag} className="feedTag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </section>

        {saveMessage ? <div className="alert info">{saveMessage}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
      </form>

      <style>{`
        .submitHero{
          display:grid;
          gap: 20px;
        }

        .submitHeroTop{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap: 18px;
        }

        .submitHeroText{
          max-width: 860px;
        }

        .submitModeBadge{
          white-space: nowrap;
        }

        .submitGrid{
          align-items:start;
        }

        .leftSubmissionColumn{
          display:grid;
          gap: 18px;
          align-content:start;
        }

        .campaignInfoCard{
          margin-top: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(92,214,255,0.14);
          background: rgba(255,255,255,0.03);
          display:grid;
          gap: 8px;
        }

        .campaignInfoCard.muted{
          opacity: 0.92;
        }

        .campaignInfoTop{
          display:flex;
          align-items:center;
          gap: 10px;
          flex-wrap:wrap;
        }

        .campaignInfoText,
        .campaignInfoSub{
          color: var(--muted);
          line-height: 1.6;
        }

        .campaignInfoSub{
          font-size: 13px;
        }

        .campaignBadge{
          white-space: nowrap;
        }

        .helperError{
          margin-top: 10px;
          color: #ff9cb1;
          font-size: 13px;
        }

        .uploadPanel{
          display:grid;
          gap: 16px;
        }

        .uploadDropZone{
          display:block;
          cursor:pointer;
        }

        .uploadDropZoneInner{
          border: 1px dashed rgba(92,214,255,0.28);
          background: rgba(255,255,255,0.025);
          border-radius: 18px;
          padding: 24px;
          display:grid;
          gap: 10px;
          transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
        }

        .uploadDropZone:hover .uploadDropZoneInner{
          border-color: rgba(92,214,255,0.48);
          background: rgba(92,214,255,0.04);
          transform: translateY(-1px);
        }

        .uploadIcon{
          width: 42px;
          height: 42px;
          display:grid;
          place-items:center;
          border-radius: 999px;
          background: rgba(92,214,255,0.08);
          border: 1px solid rgba(92,214,255,0.16);
          font-size: 18px;
          color: var(--cyan);
        }

        .uploadTitle{
          font-weight: 700;
          line-height: 1.5;
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

        .uploadEmpty{
          padding: 18px;
        }

        .assetList{
          display:grid;
          gap: 12px;
        }

        .assetRow{
          display:grid;
          grid-template-columns: 84px minmax(0,1fr) auto;
          gap: 14px;
          align-items:center;
          padding: 12px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .assetThumb{
          width: 84px;
          height: 84px;
          border-radius: 14px;
          overflow:hidden;
          background: rgba(255,255,255,0.04);
          display:grid;
          place-items:center;
          border: 1px solid rgba(255,255,255,0.06);
        }

        .assetImage{
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .assetFileBadge{
          font-size: 12px;
          text-transform: uppercase;
          color: var(--cyan);
          letter-spacing: 0.12em;
          padding: 10px;
          text-align:center;
        }

        .assetMeta{
          min-width:0;
        }

        .assetName{
          font-weight: 700;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .assetSub{
          margin-top: 6px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.4;
        }

        .removeAssetBtn{
          width:auto;
          white-space:nowrap;
        }

        .submitActionCard{
          display:grid;
          gap: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(92,214,255,0.14);
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.07), transparent 42%),
            linear-gradient(180deg, rgba(11,18,34,0.88), rgba(8,14,28,0.92));
        }

        .submitActionTitle{
          margin: 6px 0 0;
          font-size: 24px;
          line-height: 1.1;
        }

        .submitActionText{
          margin: 10px 0 0;
          color: var(--muted);
          line-height: 1.6;
        }

        .submitActionButtons{
          display:flex;
          gap: 12px;
          flex-wrap:wrap;
          align-items:center;
        }

        .actionPrimary,
        .actionSecondary{
          width:auto;
          white-space:nowrap;
        }

        .submitPreviewCard{
          overflow:hidden;
          border-radius: var(--radius-md);
          border: 1px solid rgba(92,214,255,0.12);
          background: linear-gradient(180deg, rgba(12,20,38,0.9), rgba(8,14,28,0.92));
        }

        .submitPreviewHeader,
        .submitPreviewBody{
          padding: 18px;
        }

        .submitIdentity{
          display:flex;
          gap: 12px;
          align-items:center;
        }

        .submitAvatar{
          width: 46px;
          height: 46px;
          border-radius: 999px;
          object-fit:cover;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
        }

        .submitAvatar.fallback{
          display:grid;
          place-items:center;
          font-weight:800;
          color: var(--cyan);
        }

        .submitCallsignRow{
          display:flex;
          gap: 8px;
          align-items:center;
          flex-wrap:wrap;
        }

        .submitIdentitySub{
          margin-top: 4px;
          color: var(--muted);
          font-size: 13px;
          line-height:1.4;
        }

        .statusPill.tiny{
          padding: 5px 8px;
          font-size: 11px;
        }

        .submitPreviewMedia{
          aspect-ratio: 4 / 3;
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: linear-gradient(180deg, rgba(11,18,34,0.95), rgba(7,12,24,0.95));
          overflow:hidden;
        }

        .submitPreviewImage{
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .submitPreviewPlaceholder{
          width:100%;
          height:100%;
          display:flex;
          flex-direction:column;
          justify-content:flex-end;
          padding: 22px;
          background:
            radial-gradient(circle at top left, rgba(92,214,255,0.16), transparent 38%),
            radial-gradient(circle at bottom right, rgba(143,114,255,0.18), transparent 36%),
            linear-gradient(180deg, rgba(14,22,44,0.96), rgba(8,14,28,0.98));
        }

        .placeholderMode{
          font-size: 12px;
          letter-spacing: 0.24em;
          text-transform:uppercase;
          color: var(--cyan);
        }

        .placeholderTarget{
          margin-top: 12px;
          font-size: clamp(22px, 3vw, 32px);
          font-weight: 800;
          max-width: 80%;
          line-height:1.08;
        }

        .placeholderSub{
          margin-top: 8px;
          color: var(--muted);
        }

        .submitPreviewTarget{
          margin: 8px 0 0;
          font-size: 28px;
          line-height: 1.08;
        }

        .previewCampaignRow{
          margin-top: 12px;
          display:flex;
          align-items:center;
          gap: 10px;
          flex-wrap:wrap;
        }

        .previewCampaignText{
          font-weight: 700;
        }

        .previewNotes{
          margin-top: 14px;
        }

        .previewNotes.muted{
          opacity: 0.8;
        }

        .previewMetaGrid{
          display:grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 12px;
          margin-top: 18px;
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
          text-transform:uppercase;
          letter-spacing:0.16em;
        }

        .previewMetaCard strong{
          line-height:1.5;
          font-size: 14px;
        }

        .previewMetaCard.full{
          grid-column: 1 / -1;
        }

        .feedTags{
          margin-top: 16px;
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

        @media (max-width: 980px){
          .submitGrid{
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 820px){
          .submitHeroTop{
            display:grid;
            grid-template-columns: 1fr;
          }

          .assetRow{
            grid-template-columns: 72px minmax(0,1fr);
          }

          .removeAssetBtn{
            grid-column: 1 / -1;
          }

          .submitActionButtons{
            flex-direction:column;
            align-items:stretch;
          }

          .actionPrimary,
          .actionSecondary{
            width:100%;
          }
        }

        @media (max-width: 640px){
          .previewMetaGrid{
            grid-template-columns: 1fr;
          }

          .placeholderTarget{
            max-width:100%;
          }
        }
      `}</style>
    </div>
  );
}
